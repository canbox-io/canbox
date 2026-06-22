const processManager = require('./processManager');
const { getAppsStore, getAppsDevStore } = require('@modules/canbox/main/storageManager');
const logger = require('@modules/utils/logger');
const path = require('path');
const fs = require('fs');
const { getAppPath } = require('@modules/canbox/main/pathManager');

class ChildprocessAppManager {
    constructor() {
        this.runningApps = new Set();
    }

    /**
     * 启动应用（子进程模式）
     * @param {string} uid - App ID
     * @param {boolean} devTag - 是否开发模式
     * @param {string} devTools - 开发者工具模式 (right, bottom, undocked, detach)
     * @returns {Object}
     */
    startApp(uid, devTag, devTools = null) {
        try {
            // 获取应用信息
            const appItem = devTag
                ? getAppsDevStore().get('default')[uid]
                : getAppsStore().get('default')[uid];

            if (!appItem) {
                logger.error(`App ${uid} not found in storage`);
                return { success: false, msg: 'App not found' };
            }

            // 获取应用路径
            const appPath = devTag ? appItem.path : path.join(getAppPath(), uid + '.asar');

            // 验证 app.json
            const appJsonPath = path.join(appPath, 'app.json');
            if (!fs.existsSync(appJsonPath)) {
                logger.error(`app.json not found for ${uid} at ${appJsonPath}`);
                return { success: false, msg: 'app.json not found' };
            }

            // 读取 app.json 验证
            const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
            logger.info(`Starting app ${uid} in childprocess mode: ${appJson.name} v${appJson.version}, devTools: ${devTools}`);

            // 启动子进程
            const child = processManager.startApp(uid, devTag, appPath, devTools);
            if (!child) {
                return { success: false, msg: 'Failed to start childprocess' };
            }

            this.runningApps.add(uid);
            logger.info(`App ${uid} started successfully in childprocess mode`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to start app ${uid} in childprocess mode:`, error);
            return { success: false, msg: error.message };
        }
    }

    /**
     * 停止应用
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    stopApp(uid) {
        const result = processManager.stopApp(uid);
        if (result) {
            this.runningApps.delete(uid);
            logger.info(`App ${uid} stopped`);
        }
        return result;
    }

    /**
     * 检查应用是否运行中
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    isAppRunning(uid) {
        return processManager.isAppRunning(uid);
    }

    /**
     * 聚焦应用（通过 IPC 通道通知子进程 show+focus 窗口）
     * @param {string} uid - App ID
     */
    focusApp(uid) {
        const child = processManager.getProcess(uid);
        if (child) {
            logger.info(`Focusing app ${uid} in childprocess mode`);
            child.send({ action: 'focus-window' });
        }
    }

    /**
     * 获取所有运行中的应用
     * @returns {Array<string>}
     */
    getAllRunningApps() {
        return Array.from(this.runningApps);
    }

    /**
     * 停止所有应用
     */
    stopAll() {
        processManager.stopAll();
        this.runningApps.clear();
    }
}

module.exports = new ChildprocessAppManager();
