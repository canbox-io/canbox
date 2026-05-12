/**
 * 更新中心配置管理模块
 *
 * 配置存储位置：Users/canbox.json
 * 配置键：updateCenter
 *
 * 配置项说明：
 * - enabled: 是否启用自动更新
 * - checkOnStartup: 是否在启动时检查
 * - checkFrequency: 检查频率
 * - autoDownload: 是否自动下载更新包
 * - autoInstall: 更新后是否自动安装
 * - updateSource: 更新源 (github/gitee/auto)
 * - skippedVersions: 跳过的版本列表
 * - lastCheckTime: 上次检查时间（时间戳）
 * - lastVersionChecked: 上次检查的版本号
 * - sourceSuccessRates: 各源历史成功率 { github: 0.9, gitee: 0.8 }
 */

const { getCanboxStore } = require('@modules/main/storageManager');
const logger = require('@modules/utils/logger');

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
    enabled: true,                    // 是否启用自动更新
    checkOnStartup: true,             // 是否在启动时检查
    checkFrequency: 'startup',         // 检查频率：startup/daily/weekly/manual
    autoDownload: false,              // 是否自动下载更新包
    autoInstall: false,               // 更新后是否自动安装
    updateSource: 'auto',             // 更新源：github/gitee/auto
    skippedVersions: [],               // 跳过的版本列表
    lastCheckTime: null,              // 上次检查时间（时间戳）
    lastVersionChecked: null,         // 上次检查的版本号
    sourceSuccessRates: {             // 各源历史成功率
        github: 1.0,
        gitee: 1.0
    }
};

/**
 * 检查频率对应的间隔时间（毫秒）
 */
const CHECK_FREQUENCY_INTERVALS = {
    startup: 0,                                    // 每次启动都检查
    daily: 24 * 60 * 60 * 1000,                    // 每天一次
    weekly: 7 * 24 * 60 * 60 * 1000,               // 每周一次
    manual: Infinity                               // 手动检查
};

/**
 * 获取更新配置
 * @returns {Promise<Object>} 更新配置
 */
async function getConfig() {
    try {
        const store = getCanboxStore();
        const config = store.get('updateCenter', DEFAULT_CONFIG);
        logger.info('[UpdateCenter] 读取配置，enabled: {}, updateSource: {}', config.enabled, config.updateSource);
        return config;
    } catch (error) {
        logger.error('[UpdateCenter] 读取配置失败: {}', error.message);
        return DEFAULT_CONFIG;
    }
}

/**
 * 保存更新配置
 * @param {Object} config - 要保存的配置
 * @returns {Promise<void>}
 */
async function saveConfig(config) {
    try {
        const store = getCanboxStore();
        logger.info('[UpdateCenter] 保存配置，enabled: {}, updateSource: {}', config.enabled, config.updateSource);
        store.set('updateCenter', config);
        const savedConfig = store.get('updateCenter');
        logger.info('[UpdateCenter] 验证保存结果，enabled: {}', savedConfig?.enabled);
    } catch (error) {
        logger.error('[UpdateCenter] 保存配置失败: {}', error.message);
        throw error;
    }
}

/**
 * 检查是否需要进行更新检查
 * @param {Object} config - 更新配置
 * @returns {Promise<boolean>} 是否需要检查更新
 */
async function shouldCheckUpdate(config) {
    if (!config.enabled) {
        logger.debug('[UpdateCenter] 自动更新未启用');
        return false;
    }

    if (config.checkFrequency === 'manual') {
        logger.debug('[UpdateCenter] 手动检查模式，跳过自动检查');
        return false;
    }

    if (config.checkFrequency === 'startup') {
        logger.debug('[UpdateCenter] startup 模式，每次启动都检查');
        return true;
    }

    if (!config.lastCheckTime) {
        logger.debug('[UpdateCenter] 首次检查更新');
        return true;
    }

    const interval = CHECK_FREQUENCY_INTERVALS[config.checkFrequency] || CHECK_FREQUENCY_INTERVALS.daily;
    const now = Date.now();
    const elapsed = now - config.lastCheckTime;

    const shouldCheck = elapsed >= interval;
    if (shouldCheck) {
        logger.debug('[UpdateCenter] 距离上次检查已超过 {} ms，需要检查更新', elapsed);
    } else {
        logger.debug('[UpdateCenter] 距离上次检查不足 {} ms，跳过检查', interval);
    }

    return shouldCheck;
}

/**
 * 更新最后检查时间
 * @param {string} version - 本次检查的版本号
 * @returns {Promise<void>}
 */
async function updateLastCheckTime(version) {
    try {
        const config = await getConfig();
        config.lastCheckTime = Date.now();
        config.lastVersionChecked = version;
        await saveConfig(config);
        logger.debug('[UpdateCenter] 检查时间已更新: v{}，时间戳: {}', version, config.lastCheckTime);
    } catch (error) {
        logger.error('[UpdateCenter] 更新检查时间失败: {}', error.message);
    }
}

/**
 * 添加跳过的版本
 * @param {string} version - 要跳过的版本号
 * @returns {Promise<void>}
 */
async function addSkippedVersion(version) {
    try {
        const config = await getConfig();
        if (!config.skippedVersions.includes(version)) {
            config.skippedVersions.push(version);
            await saveConfig(config);
            logger.debug('[UpdateCenter] 版本 v{} 已添加到跳过列表', version);
        } else {
            logger.debug('[UpdateCenter] 版本 v{} 已在跳过列表中', version);
        }
    } catch (error) {
        logger.error('[UpdateCenter] 添加跳过版本失败: {}', error.message);
        throw error;
    }
}

/**
 * 检查版本是否被跳过
 * @param {string} version - 要检查的版本号
 * @returns {Promise<boolean>} 是否被跳过
 */
async function isVersionSkipped(version) {
    try {
        const config = await getConfig();
        const skipped = config.skippedVersions.includes(version);
        if (skipped) {
            logger.debug('[UpdateCenter] 版本 v{} 在跳过列表中', version);
        }
        return skipped;
    } catch (error) {
        logger.error('[UpdateCenter] 检查跳过版本失败: {}', error.message);
        return false;
    }
}

/**
 * 清除跳过的版本列表
 * @returns {Promise<void>}
 */
async function clearSkippedVersions() {
    try {
        const config = await getConfig();
        const count = config.skippedVersions.length;
        config.skippedVersions = [];
        await saveConfig(config);
        logger.debug('[UpdateCenter] 跳过版本列表已清除，共 {} 个版本', count);
    } catch (error) {
        logger.error('[UpdateCenter] 清除跳过版本失败: {}', error.message);
        throw error;
    }
}

/**
 * 获取当前更新源
 * @returns {Promise<string>} 更新源名称
 */
async function getUpdateSource() {
    const config = await getConfig();
    return config.updateSource || 'auto';
}

/**
 * 设置更新源
 * @param {string} source - 更新源 (github/gitee/auto)
 * @returns {Promise<void>}
 */
async function setUpdateSource(source) {
    const validSources = ['github', 'gitee', 'auto'];
    if (!validSources.includes(source)) {
        throw new Error(`无效的更新源: ${source}，有效值: ${validSources.join(', ')}`);
    }

    const config = await getConfig();
    config.updateSource = source;
    await saveConfig(config);
    logger.info('[UpdateCenter] 更新源已设置为: {}', source);
}

/**
 * 记录源使用结果
 * @param {string} source - 使用的源
 * @param {boolean} success - 是否成功
 */
async function recordSourceResult(source, success) {
    try {
        const config = await getConfig();
        if (!config.sourceSuccessRates) {
            config.sourceSuccessRates = { github: 1.0, gitee: 1.0 };
        }

        const currentRate = config.sourceSuccessRates[source] || 1.0;
        const newRate = success
            ? currentRate * 0.9 + 0.1  // 成功时略微提高
            : currentRate * 0.5;       // 失败时大幅降低

        config.sourceSuccessRates[source] = Math.max(0.1, Math.min(1.0, newRate));
        await saveConfig(config);

        logger.debug('[UpdateCenter] 源 {} 成功率更新: {} -> {}', source, currentRate.toFixed(3), newRate.toFixed(3));
    } catch (error) {
        logger.error('[UpdateCenter] 记录源结果失败: {}', error.message);
    }
}

/**
 * 获取各源历史成功率
 * @returns {Promise<Object>}
 */
async function getSourceSuccessRates() {
    const config = await getConfig();
    return config.sourceSuccessRates || { github: 1.0, gitee: 1.0 };
}

module.exports = {
    DEFAULT_CONFIG,
    CHECK_FREQUENCY_INTERVALS,
    getConfig,
    saveConfig,
    shouldCheckUpdate,
    updateLastCheckTime,
    addSkippedVersion,
    isVersionSkipped,
    clearSkippedVersions,
    getUpdateSource,
    setUpdateSource,
    recordSourceResult,
    getSourceSuccessRates
};
