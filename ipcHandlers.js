const { ipcMain, dialog, shell, app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const repoIpcHandler = require('./modules/canbox/ipc/repoIpcHandler');
const shortcutIpcHandler = require('./modules/canbox/ipc/shortcutIpcHandler');
const appManagerIpcHandler = require('./modules/canbox/ipc/appManagerIpcHandler');
const initApiIpcHandlers = require('./modules/app/api');
const logger = require('./modules/utils/logger');
const i18nModule = require('./locales');
const { getCanboxStore } = require('./modules/canbox/main/storageManager');
const processBridge = require('./modules/canbox/childprocess/processBridge');
const pathManager = require('./modules/canbox/main/pathManager');
const userDataMigration = require('./modules/canbox/main/userDataMigration');
const logIpcHandler = require('./modules/canbox/ipc/logIpcHandler');
const { getAutoUpdater, IPC_CHANNELS, getUpdateSource, setUpdateSource, getSourceSuccessRates, getConfig, saveConfig } = require('./modules/canbox/update-center');
const { FileTaskIPC } = require('./modules/canbox/file-task');
const canboxDb = require('./modules/canbox/core/canboxDb');

// 默认语言为英文
let currentLanguage = 'en-US';

// 缓存已创建的临时文件，避免重复创建
let cachedTempFiles = new Map();

/**
 * 检测应用是否以 AppImage 方式运行
 * @returns {boolean} 是否为 AppImage 环境
 */
function isAppImage() {
    // 检查环境变量 APPIMAGE
    if (process.env.APPIMAGE) {
        return true;
    }
    // 检查可执行文件路径是否包含 .AppImage
    try {
        const exePath = app.getPath('exe');
        if (exePath && exePath.includes('.AppImage')) {
            return true;
        }
    } catch (error) {
        logger.warn('Failed to get exe path for AppImage detection:', error);
    }
    return false;
}

// 初始化时读取保存的语言设置
function initLanguage() {
    try {
        const canboxStore = getCanboxStore();
        const savedLanguage = canboxStore.get('language');
        if (savedLanguage) {
            currentLanguage = savedLanguage;
        } else {
            // 使用系统默认语言
            const systemLocale = app.getLocale();
            if (systemLocale.startsWith('zh')) {
                currentLanguage = 'zh-CN';
            } else {
                currentLanguage = 'en-US';
            }
        }
        logger.info(`Initialized language: ${currentLanguage}`);
    } catch (error) {
        logger.error('Failed to initialize language:', error);
    }
}

/**
 * 获取文档目录名称
 * @returns {string} 中文环境返回"文档"，其他返回"Documents"
 */
function getDocumentsDirName() {
    return currentLanguage === 'zh-CN' ? '文档' : 'Documents';
}

/**
 * 获取文档目录路径
 * @returns {string} 文档目录的完整路径
 */
function getDocumentsDir() {
    const docsDirName = getDocumentsDirName();
    return path.join(os.homedir(), docsDirName);
}

/**
 * 初始化所有 IPC 消息处理逻辑
 */
function initIpcHandlers() {


    // i18n 相关 IPC 处理
    ipcMain.handle('i18n-get-language', () => {
        return currentLanguage;
    });

    ipcMain.handle('i18n-set-language', async (event, lang) => {
        try {
            const availableLanguages = i18nModule.getAvailableLanguages();
            const isValidLang = availableLanguages.some(l => l.code === lang);

            if (!isValidLang) {
                logger.warn(`Invalid language code: ${lang}`);
                return { success: false, msg: '不支持的语言' };
            }

            currentLanguage = lang;
            const canboxStore = getCanboxStore();
            canboxStore.set('language', lang);
            logger.info(`Language changed to: ${lang}`);

            // 通知所有窗口语言已更改
            BrowserWindow.getAllWindows().forEach(win => {
                if (win.webContents) {
                    win.webContents.send('language-changed', lang);
                }
            });

            // 发送主进程语言变化事件（用于托盘菜单更新）
            app.emit('language-changed', lang);

            return { success: true };
        } catch (error) {
            logger.error('Failed to set language:', error);
            return { success: false, msg: error.message };
        }
    });

    ipcMain.handle('i18n-get-available-languages', () => {
        return i18nModule.getAvailableLanguages();
    });

    ipcMain.handle('i18n-translate', (event, key, params = {}) => {
        return i18nModule.translate(key, currentLanguage, params);
    });

    // 执行模式相关 IPC 处理
    ipcMain.handle('execution-get-global-mode', () => {
        const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');
        return executionDispatcher.getGlobalMode();
    });

    ipcMain.handle('execution-set-global-mode', async (event, mode) => {
        const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');
        return executionDispatcher.setGlobalMode(mode);
    });

    ipcMain.handle('execution-get-all-app-modes', () => {
        const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');
        return executionDispatcher.getAllAppModes();
    });

    ipcMain.handle('execution-set-app-mode', async (event, uid, mode) => {
        const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');
        return executionDispatcher.setAppMode(uid, mode);
    });

    // 字体设置相关 IPC 处理
    ipcMain.handle('font-get', () => {
        try {
            const canboxStore = getCanboxStore();
            const savedFont = canboxStore.get('font', 'default');
            logger.info(`Get font setting: ${savedFont}`);
            return savedFont;
        } catch (error) {
            logger.error('Failed to get font setting:', error);
            return 'default';
        }
    });

    ipcMain.handle('font-set', async (event, fontValue) => {
        try {
            const canboxStore = getCanboxStore();
            canboxStore.set('font', fontValue);
            logger.info(`Font changed to: ${fontValue}`);

            // 通知所有窗口字体已更改
            BrowserWindow.getAllWindows().forEach(win => {
                if (win.webContents) {
                    win.webContents.send('font-changed', fontValue);
                }
            });

            return { success: true };
        } catch (error) {
            logger.error('Failed to set font:', error);
            return { success: false, msg: error.message };
        }
    });

    // 初始化 IPC 处理器
    repoIpcHandler.init(ipcMain);
    shortcutIpcHandler.init(ipcMain);
    appManagerIpcHandler.init(ipcMain);

    // 初始化 API 相关的 IPC 处理逻辑
    initApiIpcHandlers();

    // 初始化 Canbox 操作历史数据库 IPC 处理
    initCanboxDbIpcHandlers();

    // 初始化主进程 IPC 桥接
    processBridge.initMain();

    // 日志相关的 IPC 处理器已在 logIpcHandler.js 中注册，无需额外初始化

    // 打开文件选择窗口
    ipcMain.on('openAppJson', (event, options) => {
        dialog.showOpenDialog(options).then(result => {
            if (result.canceled) {
                event.returnValue = '';
                return;
            }
            event.returnValue = result.filePaths[0];
        });
    });

    // 使用外部浏览器打开 HTML 内容（用于显示 markdown 文档）
    ipcMain.handle('open-html', async (event, htmlContent, docName) => {
        if (!htmlContent) {
            logger.warn('open-html received empty content');
            return { success: false, msg: '内容为空' };
        }
        try {
            // 创建临时文件并打开
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `doc-${Date.now()}.html`);
            fs.writeFileSync(tempFile, htmlContent, 'utf8');

            logger.info('Opening temporary HTML file: {}', tempFile);
            shell.openExternal(`file://${tempFile}`).catch(error => {
                console.error('Error opening HTML file:', error);
            });

            return { success: true };
        } catch (error) {
            console.error('Error creating temp HTML file:', error);
            return { success: false, msg: error.message };
        }
    });

    // 使用外部浏览器打开 URL
    ipcMain.on('open-url', (event, url) => {
        if (!url) {
            logger.warn('open-url received empty url');
            return;
        }
        logger.info('Opening external URL: {}', url);
        shell.openExternal(url).catch(error => {
            console.error('Error opening external link:', error);
        });
    });

    // 打包 ASAR
    ipcMain.handle('pack-asar', async (event, uid) => {
        console.info('main.js==pack-asar uid: ', uid);
        return require('@modules/canbox/build-asar').buildAsar(uid);
    });

    // 选择文件
    ipcMain.handle('select-file', async (event, options) => {
        return dialog.showOpenDialog({
            ...options,
            properties: ['openFile'],
            filters: [{ name: 'App Files', extensions: ['zip'] }],
        });
    });

    // 用户数据路径相关 IPC 处理
    
    // 获取当前数据路径
    ipcMain.handle('userData:getCurrentPath', async () => {
        try {
            return {
                success: true,
                path: pathManager.getUsersPath(),
                basePath: pathManager.getUsersBasePath()
            };
        } catch (error) {
            logger.error('Failed to get current data path:', error);
            return { success: false, error: error.message };
        }
    });

    // 获取磁盘占用
    ipcMain.handle('userData:getDiskUsage', async () => {
        try {
            const usersPath = pathManager.getUsersPath();
            const size = await userDataMigration.getDirectorySize(usersPath);
            return { success: true, size };
        } catch (error) {
            logger.error('Failed to get disk usage:', error);
            return { success: false, error: error.message };
        }
    });

    // 选择目录
    ipcMain.handle('userData:selectDirectory', async () => {
        try {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory', 'createDirectory']
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, error: 'User canceled' };
            }

            return { success: true, path: result.filePaths[0] };
        } catch (error) {
            logger.error('Failed to select directory:', error);
            return { success: false, error: error.message };
        }
    });

    // 迁移数据
    ipcMain.handle('userData:migrate', async (event, newBasePath) => {
        try {
            const result = await userDataMigration.migrateUserDataPath(newBasePath);

            // 迁移成功后延迟重启
            if (result.success) {
                // 检测 AppImage 环境
                const isAppImageEnv = isAppImage();
                logger.info(`Migration successful, AppImage environment: ${isAppImageEnv}`);

                // 添加环境标识到返回结果
                result.isAppImage = isAppImageEnv;

                // 延迟 5 秒后重启，给前端显示倒计时的机会
                setTimeout(() => {
                    logger.info('Restarting application...');
                    app.relaunch();
                    app.exit(0);
                }, 5000);
            }

            return result;
        } catch (error) {
            logger.error('Failed to migrate user data:', error);
            return { success: false, error: error.message };
        }
    });

    // 重置为默认路径
    ipcMain.handle('userData:resetToDefault', async () => {
        try {
            const defaultBasePath = app.getPath('userData');
            const result = await userDataMigration.migrateUserDataPath(defaultBasePath);

            // 迁移成功后延迟重启
            if (result.success) {
                // 检测 AppImage 环境
                const isAppImageEnv = isAppImage();
                logger.info(`Reset to default successful, AppImage environment: ${isAppImageEnv}`);

                // 添加环境标识到返回结果
                result.isAppImage = isAppImageEnv;

                // 延迟 5 秒后重启，给前端显示倒计时的机会
                setTimeout(() => {
                    logger.info('Restarting application...');
                    app.relaunch();
                    app.exit(0);
                }, 5000);
            }

            return result;
        } catch (error) {
            logger.error('Failed to reset to default path:', error);
            return { success: false, error: error.message };
        }
    });

    // 立刻重启
    ipcMain.handle('userData:restartNow', () => {
        try {
            logger.info('User requested immediate restart');
            app.relaunch();
            app.exit(0);
            return { success: true };
        } catch (error) {
            logger.error('Failed to restart application:', error);
            return { success: false, error: error.message };
        }
    });

    // 退出应用（用于 AppImage 更新模式）
    ipcMain.handle('app:quit', () => {
        try {
            logger.info('User requested to quit application');
            app.quit();
            return { success: true };
        } catch (error) {
            logger.error('Failed to quit application:', error);
            return { success: false, error: error.message };
        }
    });

    // 日志查看器窗口管理
    ipcMain.handle('log-viewer:open', () => {
        try {
            const logWindowManager = require('@modules/canbox/main/logWindowManager');
            logWindowManager.openLogViewer();
            return { success: true };
        } catch (error) {
            logger.error('Failed to open log viewer:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('log-viewer:close', () => {
        try {
            const logWindowManager = require('@modules/canbox/main/logWindowManager');
            logWindowManager.closeLogViewer();
            return { success: true };
        } catch (error) {
            logger.error('Failed to close log viewer:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('log-viewer:toggle-always-on-top', () => {
        try {
            const logWindowManager = require('@modules/canbox/main/logWindowManager');
            const newState = logWindowManager.toggleAlwaysOnTop();
            return { success: true, alwaysOnTop: newState };
        } catch (error) {
            logger.error('Failed to toggle always on top:', error);
            return { success: false, error: error.message };
        }
    });

    // 日志查看器配置 - 获取保留天数
    ipcMain.handle('logViewer:getRetentionDays', () => {
        try {
            const canboxStore = getCanboxStore();
            const retentionDays = canboxStore.get('logRetentionDays', 30);
            logger.info(`Get log retention days: ${retentionDays}`);
            return retentionDays;
        } catch (error) {
            logger.error('Failed to get log retention days:', error);
            return 30;
        }
    });

    // 日志查看器配置 - 设置保留天数
    ipcMain.handle('logViewer:setRetentionDays', async (event, days) => {
        try {
            if (days < 0 || days > 30) {
                return { success: false, msg: 'Retention days must be between 0 and 30' };
            }
            const canboxStore = getCanboxStore();
            canboxStore.set('logRetentionDays', days);
            logger.info(`Log retention days set to: ${days}`);
            return { success: true };
        } catch (error) {
            logger.error('Failed to set log retention days:', error);
            return { success: false, msg: error.message };
        }
    });

    // ========== 版本信息相关 IPC 处理 ==========

    // 获取应用和系统版本信息
    ipcMain.handle('get-versions', async () => {
        try {
            return {
                node: process.versions.node,
                chrome: process.versions.chrome,
                electron: process.versions.electron
            };
        } catch (error) {
            logger.error('Failed to get versions:', error);
            return {
                node: 'Unknown',
                chrome: 'Unknown',
                electron: 'Unknown'
            };
        }
    });

    // 获取应用包信息（package.json）
    ipcMain.handle('get-app-info', async () => {
        try {
            const packageJson = require('./package.json');
            return {
                success: true,
                info: {
                    name: packageJson.name,
                    version: packageJson.version,
                    description: packageJson.description,
                    author: packageJson.author,
                    license: packageJson.license
                }
            };
        } catch (error) {
            logger.error('Failed to get app info:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    // ========== 自动更新相关 IPC 处理 ==========

    // 检查更新
    ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATE, async () => {
        try {
            const manager = getAutoUpdater();
            // 设置为非启动时检查，确保错误能正确弹窗
            manager.setStartupCheck(false);
            const result = await manager.checkForUpdates();
            return { success: true, ...result };
        } catch (error) {
            logger.error('Failed to check for updates:', error);
            return { success: false, error: error.message };
        }
    });

    // 下载更新
    ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async () => {
        try {
            const manager = getAutoUpdater();
            await manager.downloadUpdate();
            return { success: true };
        } catch (error) {
            logger.error('Failed to download update:', error);
            return { success: false, error: error.message };
        }
    });

    // 安装更新
    ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, async () => {
        try {
            const manager = getAutoUpdater();
            await manager.installUpdate();
            return { success: true };
        } catch (error) {
            logger.error('Failed to install update:', error);
            return { success: false, error: error.message };
        }
    });

    // 取消下载
    ipcMain.handle(IPC_CHANNELS.CANCEL_DOWNLOAD, async () => {
        try {
            const manager = getAutoUpdater();
            await manager.cancelDownload();
            return { success: true };
        } catch (error) {
            logger.error('Failed to cancel download:', error);
            return { success: false, error: error.message };
        }
    });

    // 获取更新状态
    ipcMain.handle(IPC_CHANNELS.GET_UPDATE_STATUS, async () => {
        try {
            const manager = getAutoUpdater();
            const status = manager.getStatus();
            return { success: true, status };
        } catch (error) {
            logger.error('Failed to get update status:', error);
            return { success: false, error: error.message };
        }
    });

    // 获取更新配置
    ipcMain.handle(IPC_CHANNELS.GET_UPDATE_CONFIG, async () => {
        try {
            const config = await getConfig();
            const serializableConfig = JSON.parse(JSON.stringify(config));
            return { success: true, config: serializableConfig };
        } catch (error) {
            logger.error('Failed to get update config: {}', error.message || error);
            logger.error('Failed to get update config stack: {}', error.stack);
            return { success: false, error: error.message || String(error) };
        }
    });

    // 保存更新配置
    ipcMain.handle(IPC_CHANNELS.SAVE_UPDATE_CONFIG, async (event, config) => {
        try {
            await saveConfig(config);
            return { success: true };
        } catch (error) {
            logger.error('Failed to save update config:', error);
            return { success: false, error: error.message };
        }
    });

    // 跳过版本
    ipcMain.handle(IPC_CHANNELS.SKIP_VERSION, async (event, version) => {
        try {
            const manager = getAutoUpdater();
            await manager.skipVersion(version);
            return { success: true };
        } catch (error) {
            logger.error('Failed to skip version:', error);
            return { success: false, error: error.message };
        }
    });

    // 显示更新对话框（由 About.vue 触发，转发给 App.vue）
    ipcMain.on(IPC_CHANNELS.SHOW_UPDATE_DIALOG, (event) => {
        logger.info('show-update-dialog 事件收到，转发给渲染进程');
        // 向渲染进程发送事件，让 App.vue 监听到并打开对话框
        event.sender.send(IPC_CHANNELS.SHOW_UPDATE_DIALOG);
    });

    // ========== 更新源相关 IPC 处理 ==========

    // 获取当前更新源设置
    ipcMain.handle('update-source:get', async () => {
        try {
            const source = await getUpdateSource();
            const stats = await getSourceSuccessRates();
            return {
                success: true,
                source,
                stats
            };
        } catch (error) {
            logger.error('Failed to get update source:', error);
            return { success: false, error: error.message };
        }
    });

    // 设置更新源
    ipcMain.handle('update-source:set', async (event, source) => {
        try {
            if (!['github', 'mirror', 'auto'].includes(source)) {
                return { success: false, error: 'Invalid source' };
            }

            const previousSource = await getUpdateSource();
            await setUpdateSource(source);

            logger.info(`Update source changed from '${previousSource}' to '${source}'`);

            // 通知渲染进程更新源已变更
            BrowserWindow.getAllWindows().forEach(win => {
                if (win.webContents && !win.isDestroyed()) {
                    win.webContents.send('update-source:changed', {
                        from: previousSource,
                        to: source
                    });
                }
            });

            return { success: true };
        } catch (error) {
            logger.error('Failed to set update source:', error);
            return { success: false, error: error.message };
        }
    });

    // 重启应用（Linux AppImage 更新后使用）
    ipcMain.on('restart-app', () => {
        logger.info('收到重启应用请求');
        app.relaunch();
        app.quit();
    });

    // ========== 全局缩放功能 ==========
    // 获取当前缩放比例
    ipcMain.handle('zoom-get', () => {
        try {
            const canboxStore = getCanboxStore();
            const zoomFactor = canboxStore.get('zoomFactor', 1.0);
            return { success: true, factor: zoomFactor };
        } catch (error) {
            logger.error('Failed to get zoom factor:', error);
            return { success: false, factor: 1.0 };
        }
    });

    // 设置缩放比例
    ipcMain.handle('zoom-set', (event, factor) => {
        try {
            // 限制缩放范围 0.5 - 2.0
            const clampedFactor = Math.max(0.5, Math.min(2.0, factor));
            
            // 保存到配置
            const canboxStore = getCanboxStore();
            canboxStore.set('zoomFactor', clampedFactor);
            
            // 应用到所有窗口
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.setZoomFactor(clampedFactor);
                    win.webContents.send('zoom-changed', clampedFactor);
                }
            });

            logger.info('Zoom factor set to: {}', clampedFactor);
            return { success: true, factor: clampedFactor };
        } catch (error) {
            logger.error('Failed to set zoom factor:', error);
            return { success: false, error: error.message };
        }
    });

    // 重置缩放比例
    ipcMain.handle('zoom-reset', () => {
        try {
            const canboxStore = getCanboxStore();
            canboxStore.set('zoomFactor', 1.0);
            
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.setZoomFactor(1.0);
                    win.webContents.send('zoom-changed', 1.0);
                }
            });

            logger.info('Zoom factor reset to 1.0');
            return { success: true, factor: 1.0 };
        } catch (error) {
            logger.error('Failed to reset zoom factor:', error);
            return { success: false, error: error.message };
        }
    });

    // ========== 最后选中菜单功能 ==========
    // 获取最后选中的菜单
    ipcMain.handle('menu-get-last', () => {
        try {
            const canboxStore = getCanboxStore();
            const lastMenu = canboxStore.get('lastMenu', 'myApps');
            logger.info(`Get last menu: ${lastMenu}`);
            return { success: true, menu: lastMenu };
        } catch (error) {
            logger.error('Failed to get last menu:', error);
            return { success: false, menu: 'myApps' };
        }
    });

    // 设置最后选中的菜单
    ipcMain.handle('menu-set-last', (event, menuName) => {
        try {
            const canboxStore = getCanboxStore();
            canboxStore.set('lastMenu', menuName);
            logger.info(`Last menu set to: ${menuName}`);
            return { success: true };
        } catch (error) {
            logger.error('Failed to set last menu:', error);
            return { success: false, error: error.message };
        }
    });

    // ========== 开机自动启动相关 IPC 处理 ==========

    // 获取开机启动状态
    ipcMain.handle('autostart:get', () => {
        try {
            const canboxStore = getCanboxStore();
            let enabled = canboxStore.get('autostart', false);

            // 验证系统实际状态，确保配置同步
            let systemEnabled = enabled;
            if (process.platform === 'linux') {
                const autostartDir = path.join(os.homedir(), '.config', 'autostart');
                const desktopFile = path.join(autostartDir, 'canbox.desktop');
                systemEnabled = fs.existsSync(desktopFile);
            } else {
                const settings = app.getLoginItemSettings();
                systemEnabled = settings.openAtLogin;
            }

            // 同步状态
            if (systemEnabled !== enabled) {
                canboxStore.set('autostart', systemEnabled);
                enabled = systemEnabled;
            }

            logger.info('[autostart] get status: {}', enabled);
            return { success: true, enabled };
        } catch (error) {
            logger.error('[autostart] Failed to get status: {}', error);
            return { success: false, error: error.message, enabled: false };
        }
    });

    // 设置开机启动
    ipcMain.handle('autostart:set', async (event, enabled) => {
        try {
            const canboxStore = getCanboxStore();

            if (process.platform === 'linux') {
                // Linux: 手动管理 ~/.config/autostart/canbox.desktop
                const autostartDir = path.join(os.homedir(), '.config', 'autostart');
                const desktopFile = path.join(autostartDir, 'canbox.desktop');

                if (enabled) {
                    // 创建 autostart 目录
                    fs.mkdirSync(autostartDir, { recursive: true });

                    // 获取可执行文件路径
                    let execPath = app.getPath('exe');
                    if (process.env.APPIMAGE) {
                        execPath = process.env.APPIMAGE;
                    }

                    // 写入 .desktop 文件
                    const desktopContent = `[Desktop Entry]
Type=Application
Name=Canbox
Comment=Some Useful Apps
Exec=${execPath} --autostart
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
`;
                    fs.writeFileSync(desktopFile, desktopContent, 'utf8');
                    logger.info('[autostart] Created: {}', desktopFile);
                } else {
                    // 删除 .desktop 文件
                    if (fs.existsSync(desktopFile)) {
                        fs.unlinkSync(desktopFile);
                        logger.info('[autostart] Removed: {}', desktopFile);
                    }
                }
            } else {
                // Windows/macOS: 使用 Electron 原生 API
                app.setLoginItemSettings({
                    openAtLogin: enabled,
                    args: enabled ? ['--autostart'] : []
                });
                logger.info('[autostart] setLoginItemSettings: openAtLogin={}', enabled);
            }

            // 保存用户偏好
            canboxStore.set('autostart', enabled);

            return { success: true };
        } catch (error) {
            logger.error('[autostart] Failed to set: {}', error);
            return { success: false, error: error.message };
        }
    });

    // ========== Canbox 主程序配置相关 IPC 处理 ==========
    // 获取配置
    ipcMain.handle('canboxConfig-get', (event, key, defaultValue) => {
        try {
            const canboxStore = getCanboxStore();
            const value = canboxStore.get(key, defaultValue);
            return { success: true, data: value };
        } catch (error) {
            logger.error('Failed to get canbox config:', error);
            return { success: false, msg: error.message };
        }
    });

    // 设置配置
    ipcMain.handle('canboxConfig-set', (event, key, value) => {
        try {
            const canboxStore = getCanboxStore();
            canboxStore.set(key, value);
            logger.info(`Canbox config set: ${key}`);
            return { success: true };
        } catch (error) {
            logger.error('Failed to set canbox config:', error);
            return { success: false, msg: error.message };
        }
    });
}

// ========== Canbox 操作历史数据库相关 IPC 处理 ==========

/**
 * 初始化 canboxDb 相关的 IPC 消息处理逻辑
 * @description 处理来自渲染进程的操作历史记录请求
 */
function initCanboxDbIpcHandlers() {
    // canboxDb-put: 写入记录
    ipcMain.handle('canboxDb-put', async (event, param) => {
        try {
            const result = await new Promise((resolve, reject) => {
                canboxDb.put(param, (res, err) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    });

    // canboxDb-get: 获取单条记录
    ipcMain.handle('canboxDb-get', async (event, param) => {
        try {
            const result = await new Promise((resolve, reject) => {
                canboxDb.get(param, (res, err) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    });

    // canboxDb-find: 查询记录
    ipcMain.handle('canboxDb-find', async (event, query) => {
        try {
            const result = await new Promise((resolve, reject) => {
                canboxDb.find(query, (res, err) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    });

    // canboxDb-remove: 删除记录
    ipcMain.handle('canboxDb-remove', async (event, param) => {
        try {
            const result = await new Promise((resolve, reject) => {
                canboxDb.remove(param, (res, err) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    });

    // canboxDb-allDocs: 获取所有记录
    ipcMain.handle('canboxDb-allDocs', async (event, options) => {
        try {
            const result = await new Promise((resolve, reject) => {
                canboxDb.allDocs(options, (res, err) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    });

    // canboxDb-getSize: 获取存储大小
    ipcMain.handle('canboxDb-getSize', async () => {
        try {
            const result = await new Promise((resolve, reject) => {
                canboxDb.getSize((size, err) => {
                    if (err) reject(err);
                    else resolve(size);
                });
            });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    });

    // canboxDb-cleanup: 清理过期记录
    ipcMain.handle('canboxDb-cleanup', async (event, maxDays) => {
        try {
            const result = await new Promise((resolve, reject) => {
                canboxDb.cleanupByDays(maxDays, (count, err) => {
                    if (err) reject(err);
                    else resolve(count);
                });
            });
            return { success: true, data: result };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    });
}

// 初始化语言
initLanguage();

module.exports = {
    initIpcHandlers,
    getCurrentLanguage: () => currentLanguage
};