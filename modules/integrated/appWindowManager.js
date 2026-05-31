const { BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const logger = require('@modules/utils/logger');
const { getAppsStore, getAppsDevStore } = require('@modules/main/storageManager');
const { getAppPath } = require('@modules/main/pathManager');
const winState = require('@modules/main/winState');

const { handleError } = require('@modules/ipc/errorHandler');

class AppWindowManager {
    constructor() {
        // 存储应用主窗口 {uid: BrowserWindow}
        this.winMap = new Map();

        // 存储所有窗口（包括子窗口）{windowId: BrowserWindow}
        this.appMap = new Map();

        // 维护窗口父子关系 {parentId: [childId1, childId2, ...]}
        this.windowRelations = new Map();
    }

    /**
     * 启动 App
     * @param {string} uid - App ID
     * @param {boolean} devTag app开发tag，true：当前是开发app
     * @param {string} devTools - 开发者工具模式 (right, bottom, undocked, detach)
     * @returns {boolean} - 是否成功
     */
    startApp(uid, devTag, devTools = null) {
        try {
            // 验证必要参数
            if (!uid) {
                handleError(new Error('uid is required'), 'createWindow');
                return null;
            }

            // 获取应用信息
            const appItem = devTag
                ? getAppsDevStore().get('default')[uid]
                : getAppsStore().get('default')[uid];

            if (!appItem) {
                handleError(new Error('appItem is not exists'), 'createWindow');
                return null;
            }

            // 加载应用配置
            const appPath = devTag ? appItem.path : path.join(getAppPath(), uid + '.asar');
            const appJson = JSON.parse(fs.readFileSync(path.join(appPath, 'app.json'), 'utf8'));

            // 加载开发配置
            const uatDevJson = fs.existsSync(path.resolve(appPath, 'uat.dev.json'))
                ? JSON.parse(fs.readFileSync(path.resolve(appPath, 'uat.dev.json'), 'utf-8'))
                : null;

            // 创建会话（WebApp 使用持久化 session 以保持登录状态）
            const partition = appJson.type === 'webapp' ? 'persist:' + uid : uid;
            const sess = session.fromPartition(partition);
            logger.debug('__dirname: {}', __dirname);
            sess.registerPreloadScript({
                type: 'frame',
                filePath: path.join(__dirname, '../app.api.js')
            });

            // 默认窗口选项
            let options = {
                minWidth: 0,
                minHeight: 0,
                width: 800,
                height: 600,
                resizable: true,
                webPreferences: {},
                show: false
            };

            // 合并应用自定义窗口选项：如果app.json中配置了窗口选项，则合并到options中
            if (appJson.window) {
                Object.assign(options, JSON.parse(JSON.stringify(appJson.window)));
                options.show = false;   // 防止被 app.json 覆盖

                // 设置图标路径
                if (options.icon) {
                    options.icon = path.resolve(appPath, options.icon);
                } else {
                    options.icon = path.resolve(appPath, appJson.logo);
                }

                if (!devTag) {
                    const logoExt = path.extname(appJson.logo);
                    // Windows 下优先使用 ICO 格式，其他系统使用原始格式
                    const iconExt = os.platform() === 'win32' ? '.ico' : logoExt;
                    options.icon = path.resolve(getAppPath(), `${uid}${iconExt}`);
                    logger.info('[{}] 当前是正式模式，使用 app 目录下的logo / Production mode: using logo from app directory: {}', uid, options.icon);
                }

                // 设置 Web 偏好选项
                options.webPreferences = {
                    sandbox: false,
                    noSandbox: true,
                    spellcheck: false,
                    webSecurity: false,
                    nodeIntegration: false,
                    nodeIntegrationInSubFrames: true,
                    contextIsolation: true,
                    session: sess,
                    additionalArguments: [`--app-id=${uid}`],
                };
            }

            // 处理 preload 路径
            if (appJson.window?.webPreferences?.preload) {
                options.webPreferences.preload = path.resolve(appPath, appJson.window.webPreferences.preload);
            }

            // Linux 系统特殊处理 - 确保WM_CLASS正确设置，支持Wayland环境
            if (os.platform() === 'linux') {
                // 设置进程标题，使进程名显示为 appId
                process.title = appJson.id || uid;

                // 为应用窗口设置唯一的WM_CLASS，避免在Wayland dock中堆叠
                options.windowClass = `canbox-app-${uid}`;
                options.title = appJson.name || uid;
                options.titleBarStyle = 'default';
                // 为Wayland环境提供完整的窗口识别参数
                if (!options.webPreferences) options.webPreferences = {};
                options.webPreferences.additionalArguments = [
                    `--app-id=${uid}`,
                    `--app-name=${appJson.name || uid}`,
                    `--class=canbox-app-${uid}`,
                    `--wm-class=canbox-app-${uid}`
                ];
            }

            // 恢复窗口状态并创建窗口
            const state = winState.loadSync(uid);
            // 恢复窗口位置和大小
            if (state?.restore === 1 && state?.position) {
                options.x = state.position.x;
                options.y = state.position.y;
                options.width = state.position.width;
                options.height = state.position.height;
            }
            if (state?.isMax) {
                options.show = true;
            }

            logger.debug('load app window options: {}', JSON.stringify(options));

            // 创建窗口
            const appWin = new BrowserWindow(options);

            // Windows 下设置 AppUserModelID 以区分任务栏图标
            if (os.platform() === 'win32') {
                appWin.setAppDetails({
                    appId: `com.canbox.app.${uid}`,
                    appIconPath: options.icon
                });
            }

            // 确定加载URL
            const mainFile = devTag && uatDevJson?.main ? uatDevJson.main : appJson.main;
            const loadUrl = mainFile.startsWith('http')
                ? mainFile
                : `file://${path.resolve(appPath, mainFile)}`;

            logger.info('[{}] Loading URL: {}', uid, loadUrl);

            // 加载应用内容
            appWin.loadURL(loadUrl).catch(err => {
                logger.error('[{}] Failed to load URL: {}', uid, err);
                if (appWin) appWin.close();
            });

            // 设置菜单和应用详情
            appWin.setMenu(null);
            if (process.platform === 'win') {
                appWin.setAppDetails({ appId: uid });
            }

            // 设置外部链接处理（WebApp 模式下同源链接在窗口内打开）
            const { setupExternalUrlHandler } = require('@modules/core/win');
            setupExternalUrlHandler(appWin, appJson.type === 'webapp');

            // WebApp 导航增强
            if (appJson.type === 'webapp') {
                const { setupWebAppNavigation } = require('@modules/web-app/web-app-navigator');
                setupWebAppNavigation(appWin);
            }

            // 窗口缩放（Ctrl+滚轮 / Ctrl++/-/0），默认启用，支持持久化
            const { setupAppZoom, startZoomPersistence } = require('@modules/web-app/app-zoom');
            const enableZoom = appJson.window?.zoomEnabled !== false;
            const savedZoom = state?.zoomFactor || 1.0;
            setupAppZoom(appWin, enableZoom, savedZoom);
            const zoomPersistence = enableZoom ? startZoomPersistence(appWin, uid, winState, savedZoom) : null;

            // 添加错误处理，监控加载失败的情况
            appWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
                logger.error('[{}] Failed to load: {} - {}', uid, errorCode, errorDescription);
            });

            // 添加页面加载完成后的日志
            appWin.webContents.on('did-finish-load', () => {
                logger.info('[{}] did-finish-load', uid);
        
                // appWin.setBounds(state?.position);
                // 页面加载完成后、显示之前设置最大化状态（避免闪烁）
                if (state?.isMax) {
                    logger.info('[{}] did-finish-load make appWin maximized', uid);
                    appWin.maximize();
                }
                // appWin.show();
                logger.info('[{}] did-finish-load completed, now isMaxmized: {}, bounds: {}',
                    uid, appWin.isMaximized(), JSON.stringify(appWin.getBounds()));
            });

            // 准备显示事件
            appWin.on('ready-to-show', () => {
                logger.info('[{}] ready-to-show', uid);
                if (!state?.isMax) {
                    appWin.show();
                }
                // if (state?.isMax && !appWin.isMaximized()) {
                //     logger.info('[{}] ready-to-show make appWin maximized', uid);
                //     appWin.maximize();
                // }
                logger.info('[{}] ready-to-show completed, now isMaxmized: {}, bounds: {}',
                    uid, appWin.isMaximized(), JSON.stringify(appWin.getBounds()));
                // 优先使用命令行参数的 devTools，其次使用 uatDev 配置
                if (devTools) {
                    appWin.webContents.openDevTools({ mode: devTools });
                } else if (devTag && uatDevJson?.devTools) {
                    appWin.webContents.openDevTools({ mode: uatDevJson?.devTools });
                }
            });

            // 设置窗口事件
            appWin.on('close', () => {
                // 停止 zoom 持久化轮询
                if (zoomPersistence) zoomPersistence.stop();

                // 通知渲染进程
                if (appWin.webContents) {
                    appWin.webContents.send('window-close-callback');
                }
                
                // 保存窗口状态
                const bounds = appWin.getBounds();
                const isMax = appWin.isMaximized();
                const lastZoom = zoomPersistence?.getLastKnownZoom() || savedZoom;
                winState.save(uid, {
                    restore: 1,
                    isMax,
                    zoomFactor: lastZoom,
                    position: isMax ? state?.position : bounds
                }, () => {});

                logger.info('[{}] Window closing', uid);

                // 关闭子窗口
                const childWindows = this.getChildWindows(uid);
                childWindows.forEach(childId => {
                    if (this.hasWindow(childId)) {
                        const childWin = this.getWindow(childId);
                        if (!childWin.isDestroyed()) {
                            try {
                                childWin.webContents.closeDevTools();
                                childWin.removeAllListeners('close');
                                childWin.close();
                                this.removeWindow(childId);
                            } catch (e) {
                                logger.error(`关闭子窗口失败 / Failed to close child window ${childId}:`, e);
                            }
                        }
                    }
                });
                this.removeRelation(uid);

                // 关闭主窗口
                if (!appWin.isDestroyed()) {
                    try {
                        appWin.webContents.closeDevTools();
                        appWin.removeAllListeners('close');
                        appWin.close();
                    } catch (e) {
                        logger.error(`关闭窗口失败 / Failed to close window ${uid}:`, e);
                    }
                }
                this.removeWindow(uid);
                logger.info('所有相关窗口已关闭 / All related windows closed');
            });

            // 注册窗口到两个映射
            this.winMap.set(uid, appWin);  // 应用主窗口映射
            this.addWindow(uid, appWin);   // 全局窗口映射
            logger.debug('appMap length: {}', this.appMap.size);

            return true;

        } catch (error) {
            handleError(error, 'createWindow');
            return null;
        }
    }

    closeAllWindows() {
        this.winMap.forEach(window => {
            if (!window.isDestroyed()) {
                window.close();
            }
        });
        this.winMap.clear();
    }

    // ========== 窗口管理方法（原 windowManager 功能） ==========

    /**
     * 添加窗口到 appMap
     * @param {string} id - 窗口 ID
     * @param {BrowserWindow} win - 窗口实例
     */
    addWindow(id, win) {
        this.appMap.set(id, win);
    }

    /**
     * 从 appMap 中移除窗口
     * @param {string} id - 窗口 ID
     */
    removeWindow(id) {
        this.appMap.delete(id);
    }

    /**
     * 检查窗口是否存在
     * @param {string} id - 窗口 ID
     * @returns {boolean} - 是否存在
     */
    hasWindow(id) {
        return this.appMap.has(id);
    }

    /**
     * 获取窗口实例
     * @param {string} id - 窗口 ID
     * @returns {BrowserWindow} - 窗口实例
     */
    getWindow(id) {
        return this.appMap.get(id);
    }

    /**
     * 添加窗口父子关系
     * @param {string} parentId - 父窗口 ID
     * @param {string} childId - 子窗口 ID
     */
    addRelation(parentId, childId) {
        if (!this.windowRelations.has(parentId)) {
            this.windowRelations.set(parentId, []);
        }
        this.windowRelations.get(parentId).push(childId);
    }

    /**
     * 移除窗口父子关系
     * @param {string} parentId - 父窗口 ID
     */
    removeRelation(parentId) {
        this.windowRelations.delete(parentId);
    }

    /**
     * 移除特定子窗口的父子关系
     * @param {string} parentId - 父窗口 ID
     * @param {string} childId - 子窗口 ID
     */
    removeChildRelation(parentId, childId) {
        if (this.windowRelations.has(parentId)) {
            const children = this.windowRelations.get(parentId);
            const index = children.indexOf(childId);
            if (index !== -1) {
                children.splice(index, 1);
                if (children.length === 0) {
                    this.windowRelations.delete(parentId);
                }
            }
        }
    }

    /**
     * 获取子窗口列表
     * @param {string} parentId - 父窗口 ID
     * @returns {Array} - 子窗口 ID 数组
     */
    getChildWindows(parentId) {
        return this.windowRelations.get(parentId) || [];
    }

    /**
     * 检查App是否正在运行
     * @param {string} uid - App ID
     * @returns {boolean}
     */
    isAppRunning(uid) {
        const win = this.winMap.get(uid);
        return win && !win.isDestroyed();
    }

    /**
     * 聚焦App窗口
     * @param {string} uid
     * @returns {boolean}
     */
    focusApp(uid) {
        if (!this.winMap.has(uid)) {
            return;
        }
        const win = this.winMap.get(uid);
        if (win.isDestroyed()) {
            this.winMap.delete(uid);
            return;
        }
        win.show();
        win.focus();
    }
}

// 创建单例实例
const appWindowManager = new AppWindowManager();

module.exports = appWindowManager;