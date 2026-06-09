const { app } = require('electron');
const Store = require('electron-store');
const path = require('path');

/**
 * app.getPath('userData') 指向 userData 目录：
 * windows：~\AppData\Roaming\canbox\
 * linux: ~/.config/canbox/
 * mac: ~/Library/Application Support/canbox/
 */

/**
 * 获取 canbox 的 userData 路径
 * 优先使用环境变量 CANBOX_USER_DATA（子进程模式），否则使用 app.getPath('userData')
 * @returns {string} userData 路径
 */
function getCanboxUserDataPath() {
    // 子进程模式：使用主进程传递的 userData 路径
    if (process.env.CANBOX_USER_DATA) {
        return process.env.CANBOX_USER_DATA;
    }
    // Window 模式或主进程：使用默认路径
    return app.getPath('userData');
}

/**
 * 获取自定义数据根路径
 * @returns {string|null} 返回 customDataRoot 或 null
 */
function getCustomDataRoot() {
    try {
        const configStore = new Store({
            name: 'config',
            cwd: getCanboxUserDataPath()
        });
        return configStore.get('customDataRoot'); // 返回 "/data/myfolder" 或 null
    } catch (error) {
        // 不使用 logger，避免循环依赖
        console.error('Failed to read customDataRoot:', error.message);
        return null;
    }
}

/**
 * 获取 Users 目录的基础路径
 * @returns {string} 返回自定义数据根路径或默认 userData 路径
 */
function getUsersBasePath() {
    const customRoot = getCustomDataRoot();
    return customRoot || getCanboxUserDataPath();
}

/**
 * 获取完整 Users 路径
 * @returns {string} Users 目录的完整路径
 */
function getUsersPath() {
    return path.join(getUsersBasePath(), 'Users');
}

const PathManager = {
    // 获取 userData 路径
    getUserDataPath: () => {
        return app.getPath('userData');
    },
    // 定义常用路径
    getDataPath: () => {
        return getUsersPath();
    },
    getDownloadsPath: () => {
        return app.getPath('downloads');
    },
    getTempPath: () => {
        return app.getPath('temp');
    },
    // 可以根据需要扩展其他路径
    getAppPath: () => {
        // 使用环境变量 CANBOX_APP_PATH（子进程模式）
        if (process.env.CANBOX_APP_PATH) {
            return process.env.CANBOX_APP_PATH;
        }
        // 默认路径：Users/apps
        return path.join(getUsersPath(), 'apps');
    },
    getAppDataPath: () => {
        return path.join(getUsersPath(), 'data');
    },
    getAppIconPath: () => {
        return path.join(getUsersPath(), 'appIcon');
    },
    getAppTempPath: () => {
        return path.join(getUsersPath(), 'temp', 'apps');
    },
    getReposPath: () => {
        return path.join(getUsersPath(), 'repos');
    },
    getReposTempPath: () => {
        return path.join(getUsersPath(), 'temp', 'repos');
    },
    getHistoryDbPath: () => {
        return path.join(getUsersPath(), 'db', 'history');
    },
    getFileTaskDbPath: () => {
        return path.join(getUsersPath(), 'db', 'fileTask');
    }
};

module.exports = {
    ...PathManager,
    getCustomDataRoot,
    getUsersBasePath,
    getUsersPath
};