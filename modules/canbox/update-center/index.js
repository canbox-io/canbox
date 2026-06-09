/**
 * 更新中心模块入口
 *
 * 导出更新中心的所有公共接口
 *
 * 使用方式：
 * const updateCenter = require('@modules/canbox/update-center');
 * const { checkForUpdates, getConfig } = require('@modules/canbox/update-center');
 */

const { getAutoUpdater } = require('./autoUpdater');
const { UPDATE_EVENTS, IPC_CHANNELS } = require('./events');
const {
    getConfig,
    saveConfig,
    getUpdateSource,
    setUpdateSource,
    clearSkippedVersions,
    getSourceSuccessRates
} = require('./config');
const { detectRegion, getRecommendedSource, isProbablyChina } = require('./regionDetector');
const { getBestSource, testAllSources } = require('./speedTester');

module.exports = {
    // 管理器
    getAutoUpdater,

    // 核心功能
    checkForUpdates: () => getAutoUpdater().checkForUpdates(),
    downloadUpdate: () => getAutoUpdater().downloadUpdate(),
    installUpdate: () => getAutoUpdater().installUpdate(),
    cancelDownload: () => getAutoUpdater().cancelDownload(),
    skipVersion: (version) => getAutoUpdater().skipVersion(version),
    getStatus: () => getAutoUpdater().getStatus(),
    getSourceInfo: () => getAutoUpdater().getSourceInfo(),

    // 事件定义
    UPDATE_EVENTS,
    IPC_CHANNELS,

    // 配置管理
    getConfig,
    saveConfig,
    getUpdateSource,
    setUpdateSource,
    clearSkippedVersions,

    // 源相关
    getSourceSuccessRates,
    detectRegion,
    getRecommendedSource,
    isProbablyChina,
    getBestSource,
    testAllSources
};
