const { BrowserWindow, session, BaseWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const logger = require('@modules/utils/logger');
const ObjectUtils = require('@modules/canbox/utils/ObjectUtils');

const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux';

const { getAppsStore, getAppsDevStore } = require('@modules/canbox/main/storageManager');
const { getAppPath } = require('@modules/canbox/main/pathManager');
const appWindowManager = require('@modules/canbox/integrated/appWindowManager');
const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');

const { handleError } = require('@modules/canbox/ipc/errorHandler')

const appLoader = {

    /**
     * 根据appId直接打开app
     *
     * @param {String} uid app应用uid
     * @param {boolean} devTag app开发tag，true：当前是开发app
     * @param {boolean} devTools 是否打开开发者工具
     * @returns void
     */
    loadApp: async (uid, devTag, devTools = false) => {

        if (!uid) {
            return handleError(new Error('uid is required'), 'loadApp');
        }

        logger.info('Loading app {}, devTag: {}, devTools: {}', uid, devTag, devTools);

        // 检查 App 是否已运行
        if (executionDispatcher.isAppRunning(uid)) {
            executionDispatcher.focusApp(uid);
            logger.info('App {} is already running', uid);
            return;
        }

        // 通过执行调度器启动 APP
        const result = executionDispatcher.startApp(uid, devTag, devTools);

        if (!result || !result.success) {
            logger.error('Failed to load app {}: {}', uid, result?.msg || 'Unknown error');
            handleError(new Error(result?.msg || 'Unknown error'), 'loadApp');
        }
    }

};

module.exports = appLoader;