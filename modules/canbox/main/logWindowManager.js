const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const logger = require('@modules/utils/logger');
const { getCanboxStore } = require('@modules/canbox/main/storageManager');

// 加载 uatDev 配置
const uatDev = (() => {
    try {
        const uatDevPath = path.join(__dirname, '../../uat.dev.json');
        if (fs.existsSync(uatDevPath)) {
            return require(uatDevPath);
        }
        return {};
    } catch (error) {
        logger.warn('Failed to load uat.dev configuration: {}', error.message);
        return {};
    }
})();

/**
 * 日志查看器窗口管理器
 * 单例模式，确保只有一个日志查看窗口
 */

class LogWindowManager {
    constructor() {
        this.logWindow = null;
        this.autoScrollInterval = null;
        this.lastLogId = null;
    }

    /**
     * 停止自动滚动（预留方法，未来扩展使用）
     */
    stopAutoScroll() {
        if (this.autoScrollInterval) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
            logger.info('Auto scroll stopped');
        }
    }

    /**
     * 打开日志查看器窗口
     * 如果窗口已存在，则聚焦到该窗口
     */
    openLogViewer() {
        if (this.logWindow && !this.logWindow.isDestroyed()) {
            this.logWindow.focus();
            logger.info('Log viewer window already exists, focusing');
            return this.logWindow;
        }

        logger.info('Creating log viewer window');

        // 从配置恢复窗口状态
        const canboxStore = getCanboxStore();
        const savedBounds = canboxStore.get('logWindowBounds', {
            width: 800,
            height: 600,
            x: undefined,
            y: undefined
        });
        const alwaysOnTop = canboxStore.get('logWindowAlwaysOnTop', false);

        const windowConfig = {
            width: savedBounds.width,
            height: savedBounds.height,
            minWidth: 600,
            minHeight: 400,
            resizable: true,
            alwaysOnTop: alwaysOnTop,
            webPreferences: {
                sandbox: false,
                preload: path.join(__dirname, '../../preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: false,
                allowRunningInsecureContent: false,
                allowEval: false
            },
            show: false,
            autoHideMenuBar: true,
            title: 'Log Viewer'
        };

        // 设置窗口位置
        if (savedBounds.x !== undefined && savedBounds.y !== undefined) {
            windowConfig.x = savedBounds.x;
            windowConfig.y = savedBounds.y;
        }

        this.logWindow = new BrowserWindow(windowConfig);

        // 加载日志查看器页面（通过路由）
        // 使用与主窗口相同的加载逻辑
        let loadUrl;
        logger.info('app.isPackaged: {}', app.isPackaged);
        if (!app.isPackaged && uatDev?.main) {
            logger.info('Loading log viewer in uatDev mode: {}', uatDev.main);
            loadUrl = uatDev.main + '#/log-viewer';
        } else {
            const indexPath = path.join(__dirname, '../../build/index.html');
            logger.info('Loading log viewer from: {}', indexPath);
            loadUrl = `file://${indexPath.replace(/\\/g, '/')}#/log-viewer`;
        }
        this.logWindow.loadURL(loadUrl);

        this.logWindow.setMenu(null);

        // 打开开发者工具
        // this.logWindow.webContents.openDevTools({ mode: 'detach' });

        // 窗口准备显示时
        this.logWindow.on('ready-to-show', () => {
            this.logWindow.show();
            logger.info('Log viewer window shown');
        });

        // 窗口关闭时
        this.logWindow.on('close', () => {
            this.saveWindowState();
            this.stopAutoScroll();
        });

        // 窗口关闭后清理
        this.logWindow.on('closed', () => {
            this.logWindow = null;
            this.stopAutoScroll();
            logger.info('Log viewer window closed');
        });

        return this.logWindow;
    }

    /**
     * 关闭日志查看器窗口
     */
    closeLogViewer() {
        if (this.logWindow && !this.logWindow.isDestroyed()) {
            this.logWindow.close();
            logger.info('Log viewer window closed');
        }
    }

    /**
     * 切换窗口置顶状态
     */
    toggleAlwaysOnTop() {
        if (this.logWindow && !this.logWindow.isDestroyed()) {
            const currentState = this.logWindow.isAlwaysOnTop();
            this.logWindow.setAlwaysOnTop(!currentState);

            // 保存到配置
            const canboxStore = getCanboxStore();
            canboxStore.set('logWindowAlwaysOnTop', !currentState);

            logger.info('Log viewer always on top toggled: {}', !currentState);
            return !currentState;
        }
        return false;
    }

    /**
     * 保存窗口状态
     */
    saveWindowState() {
        if (!this.logWindow || this.logWindow.isDestroyed()) return;

        const bounds = this.logWindow.getBounds();
        const canboxStore = getCanboxStore();

        canboxStore.set('logWindowBounds', {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y
        });

        logger.info('Log viewer window state saved: {}', JSON.stringify(bounds));
    }

    /**
     * 获取窗口实例
     */
    getWindow() {
        return this.logWindow;
    }

    /**
     * 检查窗口是否存在
     */
    exists() {
        return this.logWindow && !this.logWindow.isDestroyed();
    }
}

// 导出单例
module.exports = new LogWindowManager();
