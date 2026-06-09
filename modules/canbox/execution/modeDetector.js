const logger = require('@modules/utils/logger');

class ModeDetector {
    /**
     * 获取当前进程的 app-id
     * @returns {string|null}
     */
    static getAppId() {
        for (const arg of process.argv) {
            if (arg.startsWith('--app-id=')) {
                return arg.split('=')[1];
            }
        }
        return null;
    }

    /**
     * 获取当前进程的 app-path
     * @returns {string|null}
     */
    static getAppPath() {
        for (const arg of process.argv) {
            if (arg.startsWith('--app-path=')) {
                return arg.split('=')[1];
            }
        }
        return null;
    }

    /**
     * 检测是否是开发模式
     * @returns {boolean}
     */
    static isDevMode() {
        return process.argv.includes('--dev-tag');
    }
}

module.exports = ModeDetector;
