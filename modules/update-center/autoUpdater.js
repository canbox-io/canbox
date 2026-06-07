/**
 * 自动更新管理器
 *
 * 负责管理自动更新的核心逻辑
 *
 * 功能：
 * - 检查更新
 * - 下载更新
 * - 安装更新
 * - 版本跳过
 * - 事件通知
 * - 多源支持（GitHub/镜像加速）
 */

const { autoUpdater } = require('electron-updater');
const semver = require('semver');
const logger = require('@modules/utils/logger');
const { UPDATE_EVENTS } = require('./events');
const {
    getConfig,
    saveConfig,
    shouldCheckUpdate,
    updateLastCheckTime,
    addSkippedVersion,
    isVersionSkipped,
    getUpdateSource,
    setUpdateSource,
    recordSourceResult
} = require('./config');
const GitHubProvider = require('./providers/githubProvider');
const MirrorProvider = require('./providers/mirrorProvider');
const { detectRegion, getRecommendedSource } = require('./regionDetector');
const { getBestSource } = require('./speedTester');

/**
 * 自动更新管理器类
 * 使用单例模式确保全局只有一个实例
 */
class AutoUpdater {
    constructor() {
        this.updateInfo = null;
        this.status = {
            state: 'idle',
            progress: 0,
            error: null,
            updateInfo: null
        };
        this.mainWindow = null;
        this.isStartupCheck = false;
        this.currentProvider = null;
        this._initAutoUpdater();
    }

    /**
     * 初始化 autoUpdater
     * @private
     */
    _initAutoUpdater() {
        autoUpdater.autoDownload = false;
        autoUpdater.allowDowngrade = false;

        const { platform } = process;
        logger.info('[AutoUpdater] 当前平台: {}, 已打包: {}', platform, process.windowsStore);

        const isAppImage = platform === 'linux' && process.env.APPIMAGE !== undefined;
        autoUpdater.autoInstallOnAppQuit = isAppImage;
        logger.info('[AutoUpdater] autoInstallOnAppQuit: {} (AppImage: {})', autoUpdater.autoInstallOnAppQuit, isAppImage);

        const appPath = process.argv[0];
        const appPathResolved = require('path').resolve(appPath);
        logger.info('[AutoUpdater] 应用路径: {}', appPath);
        logger.info('[AutoUpdater] 应用路径（绝对）: {}', appPathResolved);

        const feedUrl = autoUpdater.getFeedURL();
        logger.info('[AutoUpdater] Feed URL: {}', feedUrl || '未设置（将使用 package.json 配置）');

        const { app } = require('electron');
        logger.info('[AutoUpdater] 用户数据目录: {}', app.getPath('userData'));
        logger.info('[AutoUpdater] 临时目录: {}', app.getPath('temp'));

        this._setupUpdateEventListeners();

        logger.info('[AutoUpdater] 自动更新管理器已初始化');
    }

    /**
     * 设置更新事件监听器
     * @private
     */
    _setupUpdateEventListeners() {
        autoUpdater.on('update-available', (info) => {
            logger.info('[AutoUpdater] ✅ 事件触发: update-available - 发现新版本: v{}', info.version);
            this.updateInfo = info;
            this.status.updateInfo = info;
            this.status.state = 'ready';

            this._sendEvent(UPDATE_EVENTS.UPDATE_AVAILABLE, this._formatUpdateInfo(info));
        });

        autoUpdater.on('update-not-available', (info) => {
            logger.info('[AutoUpdater] ✅ 事件触发: update-not-available - 已是最新版本: v{}', info.version);
            this.status.state = 'idle';

            this._sendEvent(UPDATE_EVENTS.UPDATE_NOT_AVAILABLE, {
                version: info.version
            });
        });

        autoUpdater.on('download-progress', (progressObj) => {
            logger.debug('[AutoUpdater] 下载进度: {}% ({} KB/s)', progressObj.percent.toFixed(2), Math.floor(progressObj.bytesPerSecond / 1024));
            this.status.state = 'downloading';
            this.status.progress = progressObj.percent;

            this._sendEvent(UPDATE_EVENTS.DOWNLOAD_PROGRESS, {
                percent: progressObj.percent,
                bytesPerSecond: progressObj.bytesPerSecond,
                transferred: progressObj.transferred,
                total: progressObj.total
            });
        });

        autoUpdater.on('update-downloaded', (info) => {
            logger.info('[AutoUpdater] 更新包下载完成');
            this.status.state = 'ready';
            this.status.progress = 100;

            const isAppImage = process.platform === 'linux' && process.env.APPIMAGE !== undefined;
            logger.info('[AutoUpdater] 平台检测: {}, 是否为 AppImage: {}', process.platform, isAppImage);

            if (isAppImage) {
                logger.info('[AutoUpdater] Linux AppImage 检测到，发送 UPDATE_DOWNLOADED_RESTART 事件');
                this._sendEvent(UPDATE_EVENTS.UPDATE_DOWNLOADED_RESTART, {
                    ...this._formatUpdateInfo(info),
                    isAppImage: true
                });
            } else {
                logger.info('[AutoUpdater] 发送 UPDATE_DOWNLOADED 事件');
                this._sendEvent(UPDATE_EVENTS.UPDATE_DOWNLOADED, this._formatUpdateInfo(info));
            }
        });

        autoUpdater.on('error', (error) => {
            logger.error('[AutoUpdater] ❌ 事件触发: error - 更新错误: {} (代码: {})', error.message, error.code || 'UNKNOWN');
            logger.error('[AutoUpdater] ❌ 错误堆栈: {}', error.stack);

            const isPlatformNotAvailable = error.message && error.message.includes('404') &&
                error.message.includes('latest') && error.message.includes('.yml');

            if (isPlatformNotAvailable) {
                logger.info('[AutoUpdater] 当前平台没有可用的更新包，当作无可用更新处理');
                this.status.state = 'idle';
                this.status.error = null;

                this._sendEvent(UPDATE_EVENTS.UPDATE_NOT_AVAILABLE, {
                    version: 'unknown',
                    reason: 'platform-not-available'
                });
                return;
            }

            this.status.state = 'error';
            this.status.error = error;

            const errorData = {
                message: error.message,
                code: error.code || 'UNKNOWN_ERROR',
                isStartupCheck: this.isStartupCheck
            };

            logger.info('[AutoUpdater] 发送错误事件，启动时检查: {}', this.isStartupCheck);

            this._sendEvent(UPDATE_EVENTS.UPDATE_ERROR, errorData);
        });
    }

    /**
     * 设置主窗口引用
     * @param {BrowserWindow} win
     */
    setMainWindow(win) {
        this.mainWindow = win;
        logger.debug('[AutoUpdater] 主窗口引用已设置');
    }

    /**
     * 设置启动时检查标志
     * @param {boolean} isStartup
     */
    setStartupCheck(isStartup) {
        this.isStartupCheck = isStartup;
        logger.debug('[AutoUpdater] 设置启动时检查标志: {}', isStartup);
    }

    /**
     * 选择更新源
     * @returns {Promise<string>} 选择的源名称
     * @private
     */
    async _selectSource() {
        const config = await getConfig();
        const manualSource = config.updateSource || 'auto';

        if (manualSource !== 'auto') {
            logger.info('[AutoUpdater] 用户手动设置更新源: {}', manualSource);
            return manualSource;
        }

        logger.info('[AutoUpdater] 自动选择更新源...');

        const recommended = await getRecommendedSource();
        logger.info('[AutoUpdater] 基于语言推荐: {} - {}', recommended.source, recommended.reason);

        const bestSource = await getBestSource({
            githubOwner: 'rexlevin',
            githubRepo: 'canbox'
        });

        if (bestSource) {
            logger.info('[AutoUpdater] 速度测试最优源: {} (延迟: {}ms)', bestSource.name, bestSource.latency);
            return bestSource.name;
        }

        logger.warn('[AutoUpdater] 所有源测试失败，使用语言推荐: {}', recommended.source);
        return recommended.source;
    }

    /**
     * 设置 feedURL
     * @param {string} source - 源名称 (github/mirror)
     * @private
     */
    _setFeedURL(source) {
        const providers = {
            github: new GitHubProvider({ owner: 'rexlevin', repo: 'canbox' }),
            mirror: new MirrorProvider({ owner: 'rexlevin', repo: 'canbox' })
        };

        const provider = providers[source];
        if (!provider) {
            throw new Error(`未知的更新源: ${source}`);
        }

        this.currentProvider = provider;
        const feedURL = provider.getFeedURL();
        logger.info('[AutoUpdater] 设置 Feed URL: {} (源: {})', feedURL, source);
        autoUpdater.setFeedURL(feedURL);
    }

    /**
     * 检查更新
     * @returns {Promise<Object>} 检查结果
     */
    async checkForUpdates() {
        const isStartupCheck = this.isStartupCheck;
        logger.debug('[AutoUpdater] checkForUpdates 开始，isStartupCheck: {}', isStartupCheck);

        try {
            logger.info('[AutoUpdater] 开始检查更新');

            const config = await getConfig();
            if (!config.enabled) {
                logger.info('[AutoUpdater] 检查结果: 自动更新已禁用，跳过检查');
                return { available: false, reason: 'disabled' };
            }

            if (!(await shouldCheckUpdate(config))) {
                logger.info('[AutoUpdater] 检查结果: 不需要检查更新（检查频率限制）');
                return { available: false, reason: 'not-yet' };
            }

            this.status.state = 'checking';

            const selectedSource = await this._selectSource();
            this._setFeedURL(selectedSource);

            logger.debug('[AutoUpdater] 调用 electron-updater 检查更新（30秒超时）');
            const checkPromise = autoUpdater.checkForUpdates();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    logger.warn('[AutoUpdater] 更新检查超时（30秒）');
                    reject(new Error('net::ERR_CONNECTION_TIMED_OUT'));
                }, 30000);
            });

            const updateCheckResult = await Promise.race([checkPromise, timeoutPromise]);

            logger.info('[AutoUpdater] electron-updater 检查完成，结果: {}', JSON.stringify(updateCheckResult ? {
                updateInfo: updateCheckResult.updateInfo ? {
                    version: updateCheckResult.updateInfo.version,
                    releaseDate: updateCheckResult.updateInfo.releaseDate
                } : null,
                downloadPromise: updateCheckResult.downloadPromise ? 'exists' : 'none',
                cancellationToken: updateCheckResult.cancellationToken ? 'exists' : 'none'
            } : 'null'));

            const { app } = require('electron');
            const currentVersion = app.getVersion();
            logger.info('[AutoUpdater] 当前版本: {}', currentVersion);

            if (!updateCheckResult || !updateCheckResult.updateInfo) {
                await recordSourceResult(selectedSource, true);
                logger.info('[AutoUpdater] 检查结果: 无可用更新，当前已是最新版本');
                return { available: false, reason: 'no-update' };
            }

            const updateInfo = updateCheckResult.updateInfo;

            if (!semver.gt(updateInfo.version, currentVersion)) {
                await recordSourceResult(selectedSource, true);
                logger.info('[AutoUpdater] 检查结果: 当前版本 {} 已是最新（服务器版本: {}）', currentVersion, updateInfo.version);
                return { available: false, reason: 'up-to-date', currentVersion, serverVersion: updateInfo.version };
            }

            logger.info('[AutoUpdater] 检测到新版本: {} (当前版本: {})', updateInfo.version, currentVersion);

            if (updateInfo.version && (await isVersionSkipped(updateInfo.version))) {
                logger.info('[AutoUpdater] 检查结果: 版本 v{} 已被用户跳过', updateInfo.version);
                return { available: false, reason: 'skipped', version: updateInfo.version };
            }

            await updateLastCheckTime(updateInfo.version);

            const result = {
                available: true,
                version: updateInfo.version,
                releaseDate: updateInfo.releaseDate,
                releaseNotes: updateInfo.releaseNotes,
                source: selectedSource
            };

            logger.info('[AutoUpdater] 检查结果: 成功，发现新版本 v{}，源: {}', updateInfo.version, selectedSource);
            return result;
        } catch (error) {
            logger.error('[AutoUpdater] 检查结果: 失败 - {}', error.message);

            const isPlatformNotAvailable = error.message && error.message.includes('404') &&
                error.message.includes('latest') && error.message.includes('.yml');

            if (isPlatformNotAvailable) {
                logger.info('[AutoUpdater] 当前平台没有可用的更新包，当作无可用更新处理');
                this.status.state = 'idle';
                return { available: false, reason: 'platform-not-available' };
            }

            this.status.state = 'error';
            this.status.error = error;

            const errorData = {
                message: error.message,
                code: error.code || error.message.replace('net::', '') || 'UNKNOWN_ERROR',
                isStartupCheck: isStartupCheck
            };
            logger.info('[AutoUpdater] 手动发送错误事件，启动时检查: {}', isStartupCheck);
            this._sendEvent(UPDATE_EVENTS.UPDATE_ERROR, errorData);

            throw error;
        }
    }

    /**
     * 下载更新
     * @returns {Promise<void>}
     */
    async downloadUpdate() {
        try {
            logger.info('[AutoUpdater] 开始下载更新包');

            if (!this.updateInfo) {
                throw new Error('没有可用的更新信息，请先检查更新');
            }

            this.status.state = 'downloading';

            await autoUpdater.downloadUpdate();

            logger.info('[AutoUpdater] 下载完成');
        } catch (error) {
            logger.error('[AutoUpdater] 下载更新失败: {}', error.message);
            this.status.state = 'error';
            this.status.error = error;
            throw error;
        }
    }

    /**
     * 安装更新
     * @returns {Promise<void>}
     */
    async installUpdate() {
        try {
            logger.info('[AutoUpdater] 开始安装更新');

            if (this.status.state !== 'ready' || this.status.progress !== 100) {
                throw new Error('更新包未下载，请先下载更新');
            }

            const { platform } = process;
            const isAppImage = platform === 'linux' && process.env.APPIMAGE !== undefined;

            logger.info('[AutoUpdater] 当前平台: {}, 是否为 AppImage: {}', platform, isAppImage);

            if (isAppImage) {
                const { app } = require('electron');
                logger.info('[AutoUpdater] Linux AppImage 检测到，调用 app.quit() 退出应用');
                logger.info('[AutoUpdater] electron-updater 将在应用退出后自动替换文件');
                app.quit();
            } else {
                logger.info('[AutoUpdater] 调用 quitAndInstall() 退出应用并更新');
                autoUpdater.quitAndInstall();
            }
        } catch (error) {
            logger.error('[AutoUpdater] 安装更新失败: {}', error.message);
            this.status.state = 'error';
            this.status.error = error;
            throw error;
        }
    }

    /**
     * 取消下载
     * @returns {Promise<void>}
     */
    async cancelDownload() {
        try {
            logger.info('[AutoUpdater] 用户请求取消下载');
            this._sendEvent(UPDATE_EVENTS.UPDATE_CANCELLED, {});
            logger.warn('[AutoUpdater] electron-updater 不支持取消下载，已发送取消事件');
        } catch (error) {
            logger.error('[AutoUpdater] 取消下载失败: {}', error.message);
            throw error;
        }
    }

    /**
     * 获取当前更新状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            ...this.status,
            updateInfo: this.updateInfo ? this._formatUpdateInfo(this.updateInfo) : null,
            currentSource: this.currentProvider ? this.currentProvider.name : null
        };
    }

    /**
     * 跳过指定版本
     * @param {string} version
     * @returns {Promise<void>}
     */
    async skipVersion(version) {
        try {
            logger.info('[AutoUpdater] 用户跳过版本: v{}', version);
            await addSkippedVersion(version);
            logger.info('[AutoUpdater] 已将版本 v{} 添加到跳过列表', version);
        } catch (error) {
            logger.error('[AutoUpdater] 跳过版本失败: {}', error.message);
            throw error;
        }
    }

    /**
     * 获取源信息
     * @returns {Promise<Object>}
     */
    async getSourceInfo() {
        const config = await getConfig();
        const recommended = await getRecommendedSource();
        const bestSource = await getBestSource({
            githubOwner: 'rexlevin',
            githubRepo: 'canbox'
        });

        return {
            currentSource: config.updateSource,
            recommendedSource: recommended.source,
            recommendedReason: recommended.reason,
            bestSource: bestSource ? bestSource.name : null,
            bestSourceLatency: bestSource ? bestSource.latency : null,
            currentProvider: this.currentProvider ? this.currentProvider.getInfo() : null
        };
    }

    /**
     * 格式化更新信息
     * @param {Object} info
     * @returns {Object}
     * @private
     */
    _formatUpdateInfo(info) {
        return {
            version: info.version,
            releaseName: info.releaseName || `v${info.version}`,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes,
            downloaded: this.status.state === 'ready' && this.status.progress === 100,
            size: info.size
        };
    }

    /**
     * 发送事件到渲染进程
     * @param {string} eventName
     * @param {Object} data
     * @private
     */
    _sendEvent(eventName, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            logger.info('[AutoUpdater] ✅ 发送事件: {}', eventName);
            this.mainWindow.webContents.send(eventName, data);
        } else {
            logger.warn('[AutoUpdater] ❌ 主窗口不可用，无法发送事件: {}', eventName);
            logger.warn('[AutoUpdater] mainWindow = {}, isDestroyed = {}', this.mainWindow, this.mainWindow ? this.mainWindow.isDestroyed() : 'N/A');
        }
    }
}

let managerInstance = null;

/**
 * 获取自动更新管理器单例
 * @returns {AutoUpdater}
 */
function getAutoUpdater() {
    if (!managerInstance) {
        managerInstance = new AutoUpdater();
    }
    return managerInstance;
}

module.exports = {
    AutoUpdater,
    getAutoUpdater
};
