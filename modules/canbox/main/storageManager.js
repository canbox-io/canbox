const Store = require('electron-store');
const path = require('path');
const { app } = require('electron');
const logger = require('@modules/utils/logger');
const { getUsersBasePath } = require('@modules/canbox/main/pathManager');

/**
 * 统一管理 electron-store 的配置和操作
 */
class Storage {
    constructor(options = {}) {
        let cwd = options.cwd || 'Users';
        const customBase = getUsersBasePath();
        const defaultBase = app.getPath('userData');

        // 如果是绝对路径，直接使用
        if (path.isAbsolute(cwd)) {
            this.store = new Store({
                name: options.name || 'default',
                cwd: cwd,
                encryptionKey: options.encryptionKey
            });
            return;
        }

        // 否则，使用 customBase 或 defaultBase 作为基准
        const finalCwd = path.join(customBase || defaultBase, cwd);

        this.store = new Store({
            name: options.name || 'default',
            cwd: finalCwd,
            encryptionKey: options.encryptionKey
        });

        // 调试：记录实际使用的路径
        if (options.name === 'canbox') {
            logger.debug('[Storage] canbox.json path: {} / {}', finalCwd, finalCwd);
        }
    }

    /**
     * 获取存储的值
     * @param {string} key
     * @param {any} defaultValue
     * @returns {any}
     */
    get(key, defaultValue) {
        return this.store.get(key, defaultValue);
    }

    /**
     * 设置存储的值
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
        this.store.set(key, value);
    }

    /**
     * 删除存储的值
     * @param {string} key
     */
    delete(key) {
        this.store.delete(key);
    }

    /**
     * 检查键是否存在
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return this.store.has(key);
    }
}

/**
 * 获取 winState 存储实例
 * @returns {Storage}
 */
function getWinStateStore() {
    return new Storage({
        name: 'winState',
        cwd: 'Users'
    });
}

/**
 * 获取 apps 存储实例
 * @returns {Storage}
 */
function getAppsStore() {
    return new Storage({
        name: 'apps',
        cwd: 'Users'
    });
}

/**
 * 获取 appsDev 存储实例
 * @returns {Storage}
 */
function getAppsDevStore() {
    return new Storage({
        name: 'appsDev',
        cwd: 'Users'
    });
}

/**
 * 获取 repos 存储实例
 * @returns {Storage}
 */
function getReposStore() {
    return new Storage({
        name: 'repos',
        cwd: 'Users'
    });
}

/**
 * 获取 canbox 信息存储实例
 * @returns {Storage}
 */
function getCanboxStore() {
    return new Storage({
        name: 'canbox',
        cwd: 'Users'
    });
}

/**
 * 获取 app-execution 配置存储实例
 * @returns {Storage}
 */
function getAppExecutionStore() {
    return new Storage({
        name: 'app-execution',
        cwd: 'Users'
    });
}

/**
 * 获取 Canbox 系统配置存储实例
 * 配置文件在 userData 目录下，和 Users/ 平级
 * 用于存储 customDataRoot 等系统级配置
 * @returns {Storage}
 */
function getSystemConfigStore() {
    // 系统配置必须存储在默认 userData 目录下，不受 customDataRoot 影响
    return new Storage({
        name: 'config',
        cwd: app.getPath('userData')  // 直接使用默认 userData 路径
    });
}

module.exports = {
    getWinStateStore,
    getAppsStore,
    getAppsDevStore,
    getReposStore,
    getCanboxStore,
    getAppExecutionStore,
    getSystemConfigStore
};
