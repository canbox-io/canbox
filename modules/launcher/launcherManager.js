const { BrowserWindow, globalShortcut, screen, app } = require('electron');
const fs = require('fs');
const path = require('path');
const logger = require('@modules/utils/logger');
const { getCanboxStore } = require('@modules/main/storageManager');

/** 窗口四周留白，为 CSS box-shadow 外发光提供渲染空间 */
const SHADOW_PADDING = 48;

/**
 * 读取 dev URL 配置（与 main.js 保持一致）
 * @returns {string|null} dev URL，不存在则返回 null
 */
function getDevUrl() {
    try {
        const uatDevPath = path.join(__dirname, '../../uat.dev.json');
        if (fs.existsSync(uatDevPath)) {
            const uatDev = require(uatDevPath);
            return uatDev.main || null;
        }
    } catch (error) {
        logger.debug('[Launcher] 读取 uat.dev.json 失败: {}', error.message);
    }
    return null;
}

/**
 * 启动器管理器（单例）
 * 负责启动器窗口的创建、快捷键注册和显示/隐藏
 */
class LauncherManager {
    constructor() {
        this.win = null;
        this.isVisible = false;
        this.config = null;
        this._initialized = false;
        this._cachedApps = null;
    }

    /**
     * 初始化启动器
     */
    init() {
        if (this._initialized) {
            logger.warn('[Launcher] 已经初始化，跳过重复初始化');
            return;
        }

        this.loadConfig();

        if (this.config.enabled) {
            this.registerShortcut();
        }

        this._initialized = true;
        logger.info('[Launcher] 初始化完成, enabled={}, shortcut={}', this.config.enabled, this.config.shortcut);
    }

    /**
     * 加载配置
     */
    loadConfig() {
        const canboxStore = getCanboxStore();
        this.config = canboxStore.get('launcher', {
            enabled: false,
            shortcut: 'Alt+Space',
            position: 'top-third',
            width: 600,
            fontSize: 16,
            borderRadius: 12,
            extraShortcutDirs: []
        });
    }

    /**
     * 保存配置
     * @param {Object} newConfig - 新配置（部分更新）
     */
    saveConfig(newConfig) {
        const oldShortcut = this.config.shortcut;
        const oldEnabled = this.config.enabled;

        this.config = { ...this.config, ...newConfig };
        const canboxStore = getCanboxStore();
        canboxStore.set('launcher', this.config);

        // 快捷键或启用状态变化时重新注册
        if (newConfig.shortcut !== undefined || newConfig.enabled !== undefined) {
            if (!this.config.enabled) {
                globalShortcut.unregisterAll();
            } else {
                this.registerShortcut();
            }
        }

        logger.info('[Launcher] 配置已保存');
    }

    /**
     * 注册全局快捷键
     * @returns {{ success: boolean, conflict?: boolean }}
     */
    registerShortcut() {
        // 先注销所有快捷键
        globalShortcut.unregisterAll();

        if (!this.config.enabled || !this.config.shortcut) {
            return { success: true };
        }

        try {
            const ret = globalShortcut.register(this.config.shortcut, () => {
                this.toggle();
            });

            if (!ret) {
                logger.warn('[Launcher] 快捷键注册失败（已被占用）: {}', this.config.shortcut);
                return { success: false, conflict: true };
            }

            logger.info('[Launcher] 快捷键注册成功: {}', this.config.shortcut);
            return { success: true };
        } catch (error) {
            logger.error('[Launcher] 快捷键注册异常: {}', error.message);
            return { success: false, conflict: false };
        }
    }

    /**
     * 检查快捷键是否可用（不实际注册）
     * @param {string} shortcut
     * @returns {{ success: boolean }}
     */
    checkShortcut(shortcut) {
        try {
            const ret = globalShortcut.register(shortcut, () => {
                // 空回调，仅用于测试
            });

            if (ret) {
                globalShortcut.unregister(shortcut);
            }

            // 恢复原有快捷键
            if (this.config.enabled && this.config.shortcut) {
                this.registerShortcut();
            }

            return { success: ret };
        } catch (error) {
            logger.error('[Launcher] 检查快捷键异常: {}', error.message);
            return { success: false };
        }
    }

    /**
     * 切换显示/隐藏
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * 显示启动器窗口
     */
    show() {
        if (!this.win || this.win.isDestroyed()) {
            this.createWindow();
        }

        if (this.win && !this.win.isDestroyed()) {
            // 每次显示前重新计算位置（使用窗口总宽度，含 shadow padding）
            const totalWidth = (this.config.width || 600) + SHADOW_PADDING * 2;
            const { x, y } = this.calculateWindowPosition(totalWidth);
            this.win.setPosition(x, y);

            this.win.show();
            this.win.focus();

            // 通知渲染进程窗口已显示（清空输入、重新获取焦点）
            this.win.webContents.send('launcher:shown');

            this.isVisible = true;
            logger.info('[Launcher] 窗口已显示');
        }
    }

    /**
     * 隐藏启动器窗口
     */
    hide() {
        if (this.win && !this.win.isDestroyed()) {
            this.win.hide();
            this.isVisible = false;
            logger.debug('[Launcher] 窗口已隐藏');
        }
    }

    /**
     * 创建启动器窗口
     */
    createWindow() {
        const config = this.config;
        const contentWidth = config.width || 600;
        const width = contentWidth + SHADOW_PADDING * 2;
        const height = 320 + SHADOW_PADDING * 2;
        const { x, y } = this.calculateWindowPosition(width);

        this.win = new BrowserWindow({
            width,
            height,
            x,
            y,
            frame: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            show: false,
            transparent: true,
            hasShadow: true,
            type: 'toolbar',
            webPreferences: {
                preload: path.join(__dirname, '../../preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                partition: 'launcher'
            }
        });

        // 设置窗口类型为 toolbar 以避免获取焦点时影响其他窗口
        if (process.platform === 'linux') {
            this.win.setAlwaysOnTop(true, 'floating');
        }

        // 加载启动器界面（与 main.js 保持一致的加载逻辑）
        const isDev = !app.isPackaged;
        const devUrl = isDev ? getDevUrl() : null;
        if (isDev && devUrl) {
            logger.info('[Launcher] 加载启动器 (dev): {}', devUrl + '#/launcher');
            this.win.loadURL(devUrl + '#/launcher');
        } else {
            const indexPath = path.join(__dirname, '../../build/index.html');
            logger.info('[Launcher] 加载启动器 (file): {}#/launcher', indexPath);
            this.win.loadURL(require('url').format({
                pathname: indexPath,
                protocol: 'file:',
                slashes: true,
                hash: '/launcher'
            }));
        }

        // 强制 launcher 窗口 zoom 为 1.0，并从 Chromium 层面锁定视觉缩放
        this.win.webContents.on('did-finish-load', () => {
            this.win.webContents.setZoomFactor(1.0);
            this.win.webContents.setVisualZoomLevelLimits(1, 1);
        });

        // 失去焦点时自动隐藏
        this.win.on('blur', () => {
            this.hide();
        });

        // 窗口关闭时清理引用
        this.win.on('closed', () => {
            this.win = null;
            this.isVisible = false;
        });

        logger.info('[Launcher] 窗口创建完成, width={}', width);
    }

    /**
     * 计算窗口位置（横向居中，纵向距顶三分之一）
     * @param {number} width - 窗口宽度
     * @returns {{ x: number, y: number }}
     */
    calculateWindowPosition(width) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

        const x = Math.floor((screenWidth - width) / 2);
        const y = Math.floor(screenHeight / 3);

        return { x, y };
    }

    /**
     * 加载并缓存系统应用列表
     * @returns {Array} 应用列表
     */
    loadApps() {
        const { getSystemApplications } = require('./systemAppReader');
        const systemApps = getSystemApplications();
        // 过滤掉 Canbox 自身的快捷方式
        this._cachedApps = systemApps.filter(app => {
            return app.id.toLowerCase() !== 'canbox';
        });
        logger.info('[Launcher] 加载了 {} 个应用', this._cachedApps.length);
        return this._cachedApps;
    }

    /**
     * 获取缓存的应用列表（如果未缓存则先加载）
     * @returns {Array} 应用列表
     */
    getCachedApps() {
        if (!this._cachedApps) {
            return this.loadApps();
        }
        return this._cachedApps;
    }

    /**
     * 搜索应用
     * @param {string} query - 用户输入
     * @param {number} limit - 返回结果数量上限
     * @returns {Array} 匹配的应用列表
     */
    searchApps(query, limit = 5) {
        const apps = this.getCachedApps();
        const { searchApps: doSearch } = require('./appSearchEngine');
        return doSearch(query, apps, limit);
    }

    /**
     * 销毁启动器
     */
    destroy() {
        globalShortcut.unregisterAll();
        if (this.win && !this.win.isDestroyed()) {
            this.win.close();
        }
        this.win = null;
        this.isVisible = false;
        this._cachedApps = null;
        this._initialized = false;
        logger.info('[Launcher] 已销毁');
    }
}

module.exports = new LauncherManager();
