const appWindowManager = require('@modules/canbox/integrated/appWindowManager');
const childprocessAppManager = require('@modules/canbox/childprocess/childprocessAppManager');
const configResolver = require('@modules/canbox/childprocess/configResolver');
const logger = require('@modules/utils/logger');

class ExecutionDispatcher {
    constructor() {
        this.initialized = false;
    }

    /**
     * 初始化
     */
    init() {
        if (this.initialized) return;

        // 加载配置
        configResolver.loadExecutionConfig();

        logger.info('ExecutionDispatcher initialized');
        this.initialized = true;
    }

    /**
     * 启动 APP（核心调度方法）
     * @param {string} uid - App ID
     * @param {boolean} devTag - 是否开发模式
     * @param {string} devTools - 开发者工具模式 (right, bottom, undocked, detach)
     * @returns {Object}
     */
    startApp(uid, devTag, devTools) {
        const mode = configResolver.resolveExecutionMode(uid, devTag);
        logger.info(`Dispatching app ${uid} with mode: ${mode}, devTag: ${devTag}, devTools: ${devTools}`);

        switch (mode) {
            case 'childprocess':
                return childprocessAppManager.startApp(uid, devTag, devTools);
            case 'window':
            default:
                return { success: appWindowManager.startApp(uid, devTag, devTools) };
        }
    }

    /**
     * 停止 APP
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    stopApp(uid) {
        const mode = configResolver.resolveExecutionMode(uid, false);
        logger.info(`Stopping app ${uid} with mode: ${mode}`);

        switch (mode) {
            case 'childprocess':
                return childprocessAppManager.stopApp(uid);
            case 'window':
            default:
                // 窗口模式直接关闭窗口
                const win = appWindowManager.getWindow(uid);
                if (win && !win.isDestroyed()) {
                    win.close();
                    return true;
                }
                return false;
        }
    }

    /**
     * 检查 APP 是否运行中
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    isAppRunning(uid) {
        const mode = configResolver.resolveExecutionMode(uid, false);

        switch (mode) {
            case 'childprocess':
                return childprocessAppManager.isAppRunning(uid);
            case 'window':
            default:
                return appWindowManager.isAppRunning(uid);
        }
    }

    /**
     * 聚焦 APP
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    focusApp(uid) {
        const mode = configResolver.resolveExecutionMode(uid, false);

        switch (mode) {
            case 'childprocess':
                childprocessAppManager.focusApp(uid);
                return true;
            case 'window':
            default:
                appWindowManager.focusApp(uid);
                return true;
        }
    }

    /**
     * 获取所有运行的 APP
     * @returns {Array<Object>} - [{ uid, mode }]
     */
    getAllRunningApps() {
        const runningApps = [];

        // 窗口模式的 APP
        appWindowManager.winMap.forEach((win, uid) => {
            if (!win.isDestroyed()) {
                runningApps.push({ uid, mode: 'window' });
            }
        });

        // 子进程模式的 APP
        const childprocessApps = childprocessAppManager.getAllRunningApps();
        childprocessApps.forEach(uid => {
            runningApps.push({ uid, mode: 'childprocess' });
        });

        return runningApps;
    }

    /**
     * 关闭所有 APP
     */
    closeAllApps() {
        logger.info('Closing all apps');
        appWindowManager.closeAllWindows();
        childprocessAppManager.stopAll();
    }

    /**
     * 更新配置（当设置改变时调用）
     */
    updateConfig() {
        configResolver.clearCache();
        logger.info('Execution config updated');
    }

    /**
     * 获取全局执行模式
     * @returns {string}
     */
    getGlobalMode() {
        return configResolver.getGlobalMode();
    }

    /**
     * 设置全局执行模式
     * @param {string} mode - "window" | "childprocess" | "custom"
     */
    setGlobalMode(mode) {
        return configResolver.setGlobalMode(mode);
    }

    /**
     * 获取所有 APP 的执行模式
     * @returns {Object}
     */
    getAllAppModes() {
        return configResolver.getAllAppModes();
    }

    /**
     * 设置应用的执行模式
     * @param {string} uid - App ID
     * @param {string} mode - "window" | "childprocess"
     */
    setAppMode(uid, mode) {
        return configResolver.setAppMode(uid, mode);
    }
}

module.exports = new ExecutionDispatcher();
