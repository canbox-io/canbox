const { ipcMain, ipcRenderer } = require('electron');
const logger = require('@modules/utils/logger');

// 检测当前运行环境
const isRendererProcess = typeof process !== 'undefined' && process.type === 'renderer';

class ProcessBridge {
    constructor() {
        this.mainToChildprocessCallbacks = new Map();
        this.childprocessToMainCallbacks = new Map();
        this.messageId = 0;
    }

    /**
     * 主进程初始化
     */
    initMain() {
        ipcMain.on('childprocess-message', (event, { messageId, channel, data }) => {
            logger.info(`Received childprocess message: ${channel}, id: ${messageId}`);

            // 处理来自子进程的请求
            this.handleChildprocessRequest(event, messageId, channel, data);
        });

        logger.info('ProcessBridge initialized in main process mode');
    }

    /**
     * 子进程初始化（在渲染进程中调用）
     */
    initChildprocess() {
        if (!isRendererProcess) {
            logger.warn('initChildprocess called in non-renderer process, skipping');
            return;
        }

        if (!ipcRenderer) {
            logger.error('ipcRenderer is not available, cannot init childprocess bridge');
            return;
        }

        ipcRenderer.on('main-message', (event, { messageId, channel, data }) => {
            logger.info(`Received main process message: ${channel}, id: ${messageId}`);

            // 处理来自主进程的响应
            const callback = this.childprocessToMainCallbacks.get(messageId);
            if (callback) {
                callback(data);
                this.childprocessToMainCallbacks.delete(messageId);
            } else {
                logger.warn(`No callback found for messageId: ${messageId}`);
            }
        });

        logger.info('ProcessBridge initialized in childprocess mode');
    }

    /**
     * 处理子进程请求（在主进程中调用）
     * @param {Object} event - IPC event
     * @param {number} messageId - 消息 ID
     * @param {string} channel - 通道名
     * @param {Object} data - 数据
     */
    handleChildprocessRequest(event, messageId, channel, data) {
        // 这里将子进程的请求转发到对应的 IPC handler
        // 需要与 ipcHandlers.js 集成
        logger.info(`Forwarding childprocess request to handler: ${channel}`);

        // 临时实现：存储 event 以便响应
        this.mainToChildprocessCallbacks.set(messageId, event);
    }

    /**
     * 发送响应给子进程
     * @param {number} messageId - 消息 ID
     * @param {Object} data - 响应数据
     */
    sendResponseToChildprocess(messageId, data) {
        const event = this.mainToChildprocessCallbacks.get(messageId);
        if (event && event.sender) {
            event.sender.send('main-message', { messageId, data });
            this.mainToChildprocessCallbacks.delete(messageId);
        } else {
            logger.warn(`No event found for messageId: ${messageId}`);
        }
    }

    /**
     * 子进程向主进程发送请求
     * @param {string} channel - 通道名
     * @param {Object} data - 请求数据
     * @returns {Promise}
     */
    sendToMainProcess(channel, data) {
        return new Promise((resolve, reject) => {
            const messageId = ++this.messageId;

            this.childprocessToMainCallbacks.set(messageId, (result) => {
                if (result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result.data);
                }
            });

            ipcRenderer.send('childprocess-message', { messageId, channel, data });

            // 超时处理
            setTimeout(() => {
                if (this.childprocessToMainCallbacks.has(messageId)) {
                    this.childprocessToMainCallbacks.delete(messageId);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
}

module.exports = new ProcessBridge();
