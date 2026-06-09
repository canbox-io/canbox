const { platform } = require('os');
const sudo = require('@vscode/sudo-prompt');
const electronSudo = require('electron-sudo');
const logger = require('@modules/utils/logger');

/**
 * Sudo 模块 - 提供跨平台的提权执行命令功能
 * 支持 Linux/macOS (sudo-prompt) 和 Windows (electron-sudo)
 */
class Sudo {
    /**
     * 将 name 净化为 sudo-prompt 可接受的格式
     * sudo-prompt 要求 name 只能包含 ASCII 字母、数字和空格，且长度不超过 70
     * 此方法保留 ASCII 部分，过滤非 ASCII 字符，若结果为空则回退为 "Canbox"
     * @param {string} name - 原始操作名称
     * @returns {string} 净化后的名称
     */
    _sanitizeName(name) {
        const sanitized = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        return sanitized.length > 0 ? sanitized.substring(0, 70) : 'Canbox';
    }

    /**
     * 执行需要提权的命令
     * @param {object} options - 选项
     * @param {string} options.command - 要执行的命令
     * @param {string} options.name - 操作名称（用于提示用户，支持中文等非 ASCII 字符）
     * @param {string} [options.icns] - macOS 图标路径（可选）
     * @returns {Promise} - 返回执行结果
     */
    exec(options) {
        return new Promise((resolve, reject) => {
            if (!options || !options.command) {
                reject(new Error('缺少必需参数：command'));
                return;
            }

            const name = options.name || 'Canbox';
            const sanitizedName = this._sanitizeName(name);
            logger.info('[sudo] name: "{}", sanitized: "{}", platform: {}', name, sanitizedName, platform());

            if (platform() === 'win32') {
                this._execWindows(options.command, sanitizedName, resolve, reject);
            } else if (platform() === 'darwin') {
                this._execUnix(options.command, sanitizedName, options.icns, resolve, reject);
            } else {
                this._execLinux(options.command, sanitizedName, resolve, reject);
            }
        });
    }

    /**
     * Windows 平台执行命令（使用 electron-sudo）
     */
    _execWindows(command, name, resolve, reject) {
        electronSudo.exec(command, { name }, (error, stdout, stderr) => {
            if (error) {
                logger.error('[sudo] _execWindows failed: {}', error.message);
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    }

    /**
     * Linux 平台执行命令（使用 sudo-prompt）
     */
    _execLinux(command, name, resolve, reject) {
        sudo.exec(command, { name }, (error, stdout, stderr) => {
            if (error) {
                logger.error('[sudo] _execLinux failed: {}', error.message);
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    }

    /**
     * macOS 平台执行命令（使用 sudo-prompt）
     */
    _execUnix(command, name, icns, resolve, reject) {
        const options = { name };
        if (icns) {
            options.icns = icns;
        }

        sudo.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                logger.error('[sudo] _execUnix failed: {}', error.message);
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    }
}

module.exports = new Sudo();
