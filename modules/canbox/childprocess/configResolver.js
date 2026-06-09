const logger = require('@modules/utils/logger');
const { getCanboxStore } = require('@modules/canbox/main/storageManager');

class ConfigResolver {
    constructor() {
        this.cachedConfig = null;
    }

    /**
     * 加载 APP 执行模式配置（从 canbox.json）
     * @returns {Object}
     */
    loadExecutionConfig() {
        try {
            const store = getCanboxStore();

            // 读取全局模式，默认为 window
            const globalMode = store.get('execution.globalMode', 'window');
            const appModes = store.get('execution.appModes', {});

            const config = { globalMode, appModes };

            // 缓存配置
            this.cachedConfig = config;

            logger.info('Execution config loaded:', {
                globalMode,
                appModesCount: Object.keys(appModes).length
            });

            return config;
        } catch (error) {
            logger.error('Failed to load execution config:', error);
            return { globalMode: 'window', appModes: {} };
        }
    }

    /**
     * 获取全局执行模式
     * @returns {string} - "window" | "childprocess" | "custom"
     */
    getGlobalMode() {
        if (!this.cachedConfig) {
            this.loadExecutionConfig();
        }
        return this.cachedConfig?.globalMode || 'window';
    }

    /**
     * 解析应用的最终执行模式
     * @param {string} uid - App ID
     * @param {boolean} devTag - 是否开发模式
     * @returns {string} - "window" | "childprocess"
     */
    resolveExecutionMode(uid, devTag) {
        const globalMode = this.getGlobalMode();
        const appModes = this.cachedConfig?.appModes || {};
        const appMode = appModes[uid];

        // 全窗口模式
        if (globalMode === 'window') {
            return 'window';
        }

        // 全子进程模式
        if (globalMode === 'childprocess') {
            // 如果 APP 指定了 window，按 APP 的配置
            return appMode === 'window' ? 'window' : 'childprocess';
        }

        // 自定义模式：按 APP 配置
        if (globalMode === 'custom') {
            return (appMode && appMode !== '') ? appMode : 'window';  // 默认 window
        }

        return 'window';
    }

    /**
     * 设置全局执行模式
     * @param {string} mode - "window" | "childprocess" | "custom"
     */
    setGlobalMode(mode) {
        try {
            const store = getCanboxStore();
            store.set('execution.globalMode', mode);
            this.cachedConfig = null;  // 清除缓存
            logger.info(`Global execution mode set to: ${mode}`);
            return { success: true };
        } catch (error) {
            logger.error('Failed to set global mode:', error);
            return { success: false, msg: error.message };
        }
    }

    /**
     * 设置应用的执行模式
     * @param {string} uid - App ID
     * @param {string} mode - "window" | "childprocess"
     */
    setAppMode(uid, mode) {
        try {
            const store = getCanboxStore();
            const appModes = store.get('execution.appModes', {});
            appModes[uid] = mode;
            store.set('execution.appModes', appModes);
            this.cachedConfig = null;  // 清除缓存
            logger.info(`App ${uid} execution mode set to: ${mode}`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to set app mode for ${uid}:`, error);
            return { success: false, msg: error.message };
        }
    }

    /**
     * 获取所有 APP 的执行模式配置
     * @returns {Object} - { uid: mode }
     */
    getAllAppModes() {
        if (!this.cachedConfig) {
            this.loadExecutionConfig();
        }
        return this.cachedConfig?.appModes || {};
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cachedConfig = null;
        logger.info('Execution config cache cleared');
    }
}

module.exports = new ConfigResolver();
