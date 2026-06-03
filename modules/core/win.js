const { BrowserWindow, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('@modules/utils/logger');

// 初始化 pathManager 模块
const { getAppPath } = require('@modules/main/pathManager');
const APP_PATH = getAppPath();

// 初始化 storage 实例
const { getAppsDevStore, getAppsStore } = require('@modules/main/storageManager');

// 初始化 windowManager 实例（现在集成到 appWindowManager）
const windowManager = require('@modules/integrated/appWindowManager');

/**
 * 获取根域名（hostname 的最后两段）
 * 用于判断同域名不同子域名的导航（如 www.douyin.com → live.douyin.com）
 */
function getRootDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    return parts.slice(-2).join('.');
}

function isSameRootDomain(urlStr1, urlStr2) {
    try {
        const h1 = new URL(urlStr1).hostname;
        const h2 = new URL(urlStr2).hostname;
        return getRootDomain(h1) === getRootDomain(h2);
    } catch (e) {
        return false;
    }
}

/**
 * 为 WebApp 创建无菜单栏的子窗口
 * 用于处理同根域名下 window.open() 打开的页面
 */
function createChildWebAppWindow(parentWin, url, appJson, appPath, sess, uid) {
    const config = {
        width: appJson?.window?.width || 1280,
        height: appJson?.window?.height || 800,
        resizable: true,
        show: true,
        webPreferences: {
            sandbox: false,
            noSandbox: true,
            spellcheck: false,
            webSecurity: false,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: true,
            contextIsolation: true,
            session: sess
        }
    };

    if (appJson?.window?.minWidth) config.minWidth = appJson.window.minWidth;
    if (appJson?.window?.minHeight) config.minHeight = appJson.window.minHeight;

    // 设置图标
    if (appJson?.logo && appPath) {
        if (appJson.window?.icon) {
            config.icon = path.resolve(appPath, appJson.window.icon);
        } else {
            const logoExt = path.extname(appJson.logo);
            const iconExt = os.platform() === 'win32' ? '.ico' : logoExt;
            config.icon = path.resolve(getAppPath(), `${uid}${iconExt}`);
        }
    }

    // 设置 app 自定义 preload
    if (appJson?.window?.webPreferences?.preload) {
        config.webPreferences.preload = path.resolve(appPath, appJson.window.webPreferences.preload);
    }

    // Linux 系统特殊处理
    if (os.platform() === 'linux') {
        config.windowClass = `canbox-app-${uid}`;
        config.title = appJson?.name || uid;
        config.titleBarStyle = 'default';
    }

    const childWin = new BrowserWindow(config);
    childWin.setMenu(null);

    // 注册子窗口到 windowManager，父窗口关闭时自动清理
    windowManager.addWindow(childWin.id, childWin);
    windowManager.addRelation(uid, childWin.id);

    childWin.on('close', () => {
        windowManager.removeChildRelation(uid, childWin.id);
        windowManager.removeWindow(childWin.id);
    });

    // 为新窗口也设置导航处理（递归）
    setupExternalUrlHandler(childWin, true, appJson, appPath, sess, uid);

    // WebApp 导航增强（快捷键、右键菜单）
    if (appJson?.type === 'webapp') {
        const { setupWebAppNavigation } = require('@modules/web-app/web-app-navigator');
        setupWebAppNavigation(childWin);
    }

    childWin.loadURL(url).catch(err => {
        logger.error('[{}] Child window failed to load URL: {}', uid, err);
        if (childWin && !childWin.isDestroyed()) {
            childWin.close();
        }
    });

    logger.info('[{}] Child WebApp window created for: {}', uid, url);
}

function setupExternalUrlHandler(win, isWebApp = false, appJson = null, appPath = null, sess = null, uid = null) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            if (isWebApp) {
                try {
                    const currentUrl = win.webContents.getURL();
                    if (isSameRootDomain(url, currentUrl)) {
                        // 手动创建无菜单栏的子窗口
                        createChildWebAppWindow(win, url, appJson, appPath, sess, uid);
                        return { action: 'deny' };
                    }
                } catch (e) { /* fallthrough */ }
            }
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
                const currentUrl = win.webContents.getURL();
                if (isWebApp) {
                    if (isSameRootDomain(url, currentUrl)) {
                        return;
                    }
                } else {
                    const navOrigin = new URL(url).origin;
                    const currentOrigin = new URL(currentUrl).origin;
                    if (navOrigin === currentOrigin) {
                        return;
                    }
                }
            } catch (e) {
                return;
            }
            event.preventDefault();
            shell.openExternal(url);
        }
    });
}

/**
 * 窗口操作模块
 */
const winFactory = {
    setupExternalUrlHandler,
    /**
     * 新开窗口
     * @param {Object} options - 窗口配置
     * @param {Object} params - 窗口请求参数
     * @param {string} parentWindowId - 父窗口id
     * @returns {Number} 新窗口实例
     */
    createWindow: (options, params, parentWindowId = null) => {
        if (!params.url) {
            throw new Error('loadURL is required');
        }
        let loadURL = params.url;
        const devTools = params.devTools ? true : false;
        if (!parentWindowId) {
            throw new Error('parentWindowId is required');
        }

        if (!options || typeof options !== 'object') {
            logger.error('Invalid options parameter: must be an object / 无效的 options 参数: 必须是对象');
            options = { width: 800, height: 600 };
        }

        if (!options.width || !options.height) {
            logger.warn('Missing required window dimensions, using defaults / 缺少必需的窗口尺寸，使用默认值');
            options = { ...options, width: options.width || 800, height: options.height || 600, show: false };
        }

        options.parent = windowManager.getWindow(parentWindowId);

        // 没有ready的时候先不显示
        options.show = false;

        try {
            // 根据 parentWindowId 判断应用类型并拼接完整路径
            const appDevConfigObj = getAppsDevStore().get('default') || {};
            logger.debug('appDevConfigObj / appDevConfigObj: {}', JSON.stringify(appDevConfigObj));
            if (appDevConfigObj[parentWindowId]) {
                const appDevItem = appDevConfigObj[parentWindowId].path;
                const appJsonPath = path.join(appDevItem, 'app.json');
                const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
                const uatDevJson = fs.existsSync(path.resolve(appDevItem, 'uat.dev.json'))
                            ? JSON.parse(fs.readFileSync(path.resolve(appDevItem, 'uat.dev.json'), 'utf-8'))
                            : null;
                /*
                 * uat.dev.json中的main存在，那么以uat.dev.json中的main为基准；
                 * uat.dev.json中不存在，以app.json中main基准；两者都不存在，以path为基准（相对路径）
                 * uat.dev.json中的main也可能是一个相对路径，所以需要判断是否是http开头，否则需要拼接项目路径
                 */
                const mainPath = uatDevJson
                    ? uatDevJson.main.startsWith('http') ? uatDevJson.main : `file://${path.join(appDevItem, uatDevJson.main)}`
                    : appJson.main.startsWith('http') ? appJson.main : `file://${path.join(appDevItem, appJson.main)}`;
                logger.debug('mainPath / mainPath: {}', mainPath);
                loadURL = path.join(mainPath, loadURL);
            } else {
                const appJson = JSON.parse(fs.readFileSync(path.join(APP_PATH, `${parentWindowId}.asar`, 'app.json'), 'utf-8'));
                loadURL = appJson.main.startsWith('http')
                    ? path.join(appJson.main, loadURL)
                    : `file://${path.join(APP_PATH, `${parentWindowId}.asar`, appJson.main + loadURL)}`;
            }
            logger.info('win.js, loadURL / win.js, loadURL: {}', loadURL);

            const win = new BrowserWindow(options);

            // Windows 下需要修复 file 协议路径，确保使用正斜杠
            if (loadURL.startsWith('file://')) {
                loadURL = loadURL.replace(/\\/g, '/');
            }

            win.loadURL(loadURL);
            win.setMenu(null);

            setupExternalUrlHandler(win);

            // 监听 ESC 键关闭窗口
            if (params.escClose) {
                win.webContents.on('before-input-event', (event, input) => {
                    if (input.key === 'Escape') {
                        win.close();
                    }
                });
            }
            
            win.on('ready-to-show', () => {
                win.setTitle(params.title);
                win.show();
                if (devTools) {
                    win.webContents.openDevTools();
                }
            });

            // 记录窗口父子关系
            if (parentWindowId) {
                windowManager.addWindow(win.id, win);
                windowManager.addRelation(parentWindowId, win.id);
                // 存储父窗口ID到子窗口实例
                win.parentId = parentWindowId;
            }

            win.on('close', () => {
                windowManager.removeWindow(win.id);
            });

            return win.id;
        } catch (err) {
            logger.error('Failed to create window / 创建窗口失败: {}', err.message);
            throw err;
        }
    },

    /**
     * 打开对话框
     * @param {Object} options - 对话框配置
     * @returns {Promise} 对话框结果
     */
    showDialog: (options) => {
        return dialog.showOpenDialog(options);
    },

    /**
     * 发出通知
     * @param {Object} options - 通知配置
     * @param {string} options.title - 通知标题
     * @param {string} options.body - 通知内容
     */
    showNotification: (options) => {
        new Notification(options).show();
    }
};

module.exports = winFactory;