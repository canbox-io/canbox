const { spawn } = require('child_process');
const path = require('path');
const logger = require('@modules/utils/logger');

class ProcessManager {
    constructor() {
        this.processes = new Map();  // {uid: ChildProcess}
        this.maxConcurrent = 10;
        this.activeCount = 0;
    }

    /**
     * 设置子进程池配置
     * @param {Object} config
     * @param {number} config.maxConcurrent
     */
    setConfig(config) {
        this.maxConcurrent = config.maxConcurrent || 10;
        logger.info(`ProcessManager config set: maxConcurrent=${this.maxConcurrent}`);
    }

    /**
     * 启动子进程
     * @param {string} uid - App ID
     * @param {boolean} devTag - 是否开发模式
     * @param {string} appPath - 应用路径
     * @param {string} devTools - 开发者工具模式 (right, bottom, undocked, detach)
     * @returns {ChildProcess|null}
     */
    startApp(uid, devTag, appPath, devTools = null) {
        if (this.activeCount >= this.maxConcurrent) {
            logger.warn(`Process pool full (${this.activeCount}/${this.maxConcurrent}), cannot start app ${uid}`);
            return null;
        }

        try {
            // 获取 Electron 可执行文件路径
            const electronPath = process.execPath;
            const childprocessEntry = path.join(__dirname, '../../childprocessEntry.js');

            // 获取主进程的 userData 路径，传递给子进程
            const { app } = require('electron');
            const userDataPath = app.getPath('userData');

            const args = [
                childprocessEntry,
                '--no-sandbox',
                `--app-id=${uid}`,
                `--app-path=${appPath}`,
                `--user-data=${userDataPath}`
            ];

            if (devTag) {
                args.push('--dev-tag');
            }

            if (devTools) {
                args.push(`--dev-tools=${devTools}`);
            }

            logger.info(`Starting subprocess for ${uid}: ${electronPath} ${args.join(' ')}`);

            // 启动子进程
            const child = spawn(electronPath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
                env: {
                    ...process.env,
                    CANBOX_ENTRY: 'childprocess'
                }
            });

            this.processes.set(uid, child);
            this.activeCount++;

            // 监听子进程退出
            child.on('exit', (code, signal) => {
                logger.info(`Subprocess ${uid} exited with code ${code}, signal ${signal}`);
                this.processes.delete(uid);
                this.activeCount--;
            });

            child.on('error', (err) => {
                logger.error(`Subprocess ${uid} error:`, err);
                this.processes.delete(uid);
                this.activeCount--;
            });

            // 记录输出
            child.stdout.on('data', (data) => {
                logger.info(`[${uid} stdout] ${data.toString().trim()}`);
            });

            child.stderr.on('data', (data) => {
                logger.error(`[${uid} stderr] ${data.toString().trim()}`);
            });

            return child;
        } catch (error) {
            logger.error(`Failed to start subprocess for ${uid}:`, error);
            return null;
        }
    }

    /**
     * 停止子进程
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    stopApp(uid) {
        const child = this.processes.get(uid);
        if (!child) {
            logger.warn(`Subprocess ${uid} not found`);
            return false;
        }

        try {
            logger.info(`Stopping subprocess ${uid}`);
            child.kill('SIGTERM');
            this.processes.delete(uid);
            this.activeCount--;
            return true;
        } catch (error) {
            logger.error(`Failed to stop subprocess ${uid}:`, error);
            return false;
        }
    }

    /**
     * 检查子进程是否运行中
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    isAppRunning(uid) {
        const child = this.processes.get(uid);
        return child && !child.killed;
    }

    /**
     * 获取子进程
     * @param {string} uid - App ID
     * @returns {ChildProcess|null}
     */
    getProcess(uid) {
        return this.processes.get(uid);
    }

    /**
     * 停止所有子进程
     */
    stopAll() {
        logger.info(`Stopping all subprocesses (${this.processes.size})`);
        this.processes.forEach((child, uid) => {
            try {
                child.kill('SIGTERM');
            } catch (error) {
                logger.error(`Failed to stop subprocess ${uid}:`, error);
            }
        });
        this.processes.clear();
        this.activeCount = 0;
    }

    /**
     * 获取运行中的子进程数量
     * @returns {number}
     */
    getActiveCount() {
        return this.activeCount;
    }

    /**
     * 获取所有运行的 APP ID
     * @returns {Array<string>}
     */
    getAllRunningApps() {
        return Array.from(this.processes.keys());
    }
}

module.exports = new ProcessManager();
