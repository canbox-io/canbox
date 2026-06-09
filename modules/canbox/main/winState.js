const { getWinStateStore } = require('@modules/canbox/main/storageManager');

/**
 * 窗口状态管理
 * 存储位置：%UserData%/Users/data/winState.json
 * 每一个 app 的存储格式：
 * {
 *  "6fd02dc420264222a1dac4ec0b551e85": {
 *      "restore": 0,
 *      "isMax": 0,
 *      "position": {
 *          "x": 0,
 *          "y": 0,
 *          "width": 0,
 *          "height": 0
 *      }
 *  }
 * }
 */
class WinState {
    constructor() {
        this.store = getWinStateStore();
    }

    save(appId, state, callback) {
        const key = `${appId}`;
        this.store.set(key, state);
        callback({ success: true, data: null, msg: '保存成功' });
    }

    load(appId, callback) {
        const key = `${appId}`;
        const state = this.store.get(key);
        callback({ success: true, data: state || null, msg: '加载成功' });
    }

    /**
     * 返回 app 窗口状态
     * @param {string} appId 
     * @returns {object}
     */
    loadSync (appId) {
        const key = `${appId}`;
        const state = this.store.get(key);
        return state || null;
    }

    remove(appId, callback) {
        const key = `${appId}`;
        this.store.delete(key);
        callback({ success: true, data: null, msg: '删除成功' });
    }
}

module.exports = new WinState();