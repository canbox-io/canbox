const { app, BrowserWindow, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const moduleAlias = require('module-alias');

// 配置 module-alias
moduleAlias.addAliases({
    '@': path.join(__dirname, './src'),
    '@modules': path.join(__dirname, './modules')
});
moduleAlias();

// 清除启动时控制台的警告
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
app.disableHardwareAcceleration();

// 解析命令行参数（必须在加载其他模块之前，以便设置 CANBOX_USER_DATA 环境变量）
function parseArgs() {
    const args = {};
    process.argv.forEach(arg => {
        if (arg.startsWith('--app-id=')) {
            args.appId = arg.substring('--app-id='.length);
        } else if (arg.startsWith('--app-path=')) {
            args.appPath = arg.substring('--app-path='.length);
        } else if (arg === '--dev-tag') {
            args.devTag = true;
        } else if (arg.startsWith('--dev-tools=')) {
            const value = arg.substring('--dev-tools='.length);
            const validModes = ['right', 'bottom', 'undocked', 'detach'];
            args.devTools = value && validModes.includes(value) ? value : 'detach';
        } else if (arg === '--dev-tools') {
            args.devTools = 'detach';
        } else if (arg.startsWith('--user-data=')) {
            args.userData = arg.substring('--user-data='.length);
        }
    });
    return args;
}

const args = parseArgs();
const { appId, appPath, devTag = false, devTools = null, userData } = args;

// 设置全局 userData 路径环境变量，供 pathManager.js 使用
// 这样后续加载的 logger、store 等模块能正确访问 canbox 的数据目录
if (userData) {
    process.env.CANBOX_USER_DATA = userData;
}

console.log('[childprocessEntry] Starting with appId:', appId, 'appPath:', appPath, 'devTag:', devTag, 'devTools:', devTools);

if (!appId || !appPath) {
    console.error('[childprocess] Missing required arguments: --app-id or --app-path');
    app.quit();
    process.exit(1);
}

// 将 appPath 设置到 process.env，供 win.js 使用
process.env.CANBOX_APP_PATH = path.dirname(appPath);

// 设置完成后，再加载依赖 pathManager 的模块
const logger = require('@modules/utils/logger');
const processBridge = require('@modules/childprocess/processBridge');

// 记录环境变量设置
if (userData) {
    logger.info(`[childprocess] CANBOX_USER_DATA set to: ${userData}`);
}

// 注意：winState 不能在这里加载，因为它依赖 CANBOX_USER_DATA 环境变量
// 必须在 createAppWindow() 函数内加载

// 子进程不使用单实例锁，因为子进程本身就是作为独立实例运行的
// 如果同一个APP被多次启动，主进程会通过 isAppRunning 检查并聚焦已有窗口
// const getLock = app.requestSingleInstanceLock();
// if (!getLock) {
//     app.quit();
//     process.exit(0);
// }

// Fallback 定时器 ID，用于 Wayland 等环境下 ready-to-show 不触发的兜底
let readyToShowFallbackTimer = null;

app.whenReady().then(() => {
    logger.info(`[childprocess] Starting app ${appId}, dev: ${devTag}, path: ${appPath}`);

    // 初始化API IPC处理器（子进程需要提供Canbox API）
    const initApiIpcHandlers = require('@modules/main/api');
    initApiIpcHandlers();

    // 初始化主进程桥接
    processBridge.initMain();

    // 创建APP窗口
    createAppWindow();
});

app.on('window-all-closed', () => {
    console.log('[childprocessEntry] window-all-closed event, platform:', process.platform);
    if (process.platform !== 'darwin') {
        console.log('[childprocessEntry] Quitting app...');
        app.quit();
    }
});

// 添加进程退出日志
process.on('exit', (code) => {
    console.log(`[childprocessEntry] Process exiting with code: ${code}`);
});

process.on('uncaughtException', (error) => {
    console.error('[childprocessEntry] Uncaught exception:', error);
    logger.error('[childprocessEntry] Uncaught exception:', error);
});

function setupExternalUrlHandler(win, isWebApp = false) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            if (isWebApp) {
                try {
                    const currentUrl = win.webContents.getURL();
                    const navOrigin = new URL(url).origin;
                    const currentOrigin = new URL(currentUrl).origin;
                    if (navOrigin === currentOrigin) {
                        return { action: 'allow' };
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
                const navOrigin = new URL(url).origin;
                const currentOrigin = new URL(currentUrl).origin;
                if (navOrigin === currentOrigin) {
                    return;
                }
            } catch (e) {
                return;
            }
            event.preventDefault();
            shell.openExternal(url);
        }
    });
}

function createAppWindow() {
    try {
        // 在 CANBOX_USER_DATA 环境变量设置之后加载 winState
        const winState = require('@modules/main/winState');

        // 读取 app.json
        const appJsonPath = path.join(appPath, 'app.json');
        if (!fs.existsSync(appJsonPath)) {
            logger.error(`[childprocess] app.json not found at ${appJsonPath}`);
            app.quit();
            return;
        }

        const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
        logger.info(`[childprocess] Creating window for ${appJson.name} v${appJson.version}`);

        // 加载开发配置
        const uatDevJsonPath = path.resolve(appPath, 'uat.dev.json');
        const uatDevJson = fs.existsSync(uatDevJsonPath)
            ? JSON.parse(fs.readFileSync(uatDevJsonPath, 'utf-8'))
            : null;

        // 创建会话（WebApp 使用持久化 session 以保持登录状态）
        const partition = appJson.type === 'webapp' ? 'persist:' + appId : appId;
        const sess = session.fromPartition(partition);
        sess.registerPreloadScript({
            type: 'frame',
            filePath: path.join(__dirname, 'modules/app.api.js')
        });

        // 默认窗口选项
        let config = {
            minWidth: 0,
            minHeight: 0,
            width: 800,
            height: 600,
            resizable: true,
            webPreferences: {
                session: sess
            },
            show: false
        };

        // 合并应用自定义窗口选项
        if (appJson.window) {
            Object.assign(config, JSON.parse(JSON.stringify(appJson.window)));
            config.show = false;

            // 设置图标路径
            if (config.icon) {
                config.icon = path.resolve(appPath, config.icon);
            } else {
                config.icon = path.resolve(appPath, appJson.logo);
            }

            if (!devTag) {
                const logoExt = path.extname(appJson.logo);
                const iconExt = os.platform() === 'win32' ? '.ico' : logoExt;
                config.icon = path.resolve(appPath, `${appId}${iconExt}`);
                logger.info(`[${appId}] Production mode, using icon: ${config.icon}`);
            }

            // 设置 Web 偏好选项
            config.webPreferences = {
                sandbox: false,
                noSandbox: true,
                spellcheck: false,
                webSecurity: false,
                nodeIntegration: false,
                nodeIntegrationInSubFrames: true,
                contextIsolation: true,
                session: sess,
                additionalArguments: [`--app-id=${appId}`],
            };
        }

        // 处理 preload 路径
        if (appJson.window?.webPreferences?.preload) {
            config.webPreferences.preload = path.resolve(appPath, appJson.window.webPreferences.preload);
        }

        // Linux 系统特殊处理
        if (os.platform() === 'linux') {
            // 设置进程标题，使进程名显示为 appId
            process.title = appJson.id || appId;

            config.windowClass = `canbox-app-${appId}`;
            config.title = appJson.name || appId;
            config.titleBarStyle = 'default';
            if (!config.webPreferences) config.webPreferences = {};
            config.webPreferences.additionalArguments = [
                `--app-id=${appId}`,
                `--app-name=${appJson.name || appId}`,
                `--class=canbox-app-${appId}`,
                `--wm-class=canbox-app-${appId}`
            ];
        }

        // 恢复窗口状态
        const state = winState.loadSync(appId);
        if (state?.restore === 1 && state?.position) {
            config.x = state.position.x;
            config.y = state.position.y;
            config.width = state.position.width;
            config.height = state.position.height;
        }
        if (state?.isMax) {
            config.show = true;
        }

        const appWin = new BrowserWindow(config);

        // Windows 下设置 AppUserModelID
        if (os.platform() === 'win32') {
            appWin.setAppDetails({
                appId: `com.canbox.app.${appId}`,
                appIconPath: config.icon
            });
        }

        // 确定加载URL
        const mainFile = devTag && uatDevJson?.main ? uatDevJson.main : appJson.main;
        const loadUrl = mainFile.startsWith('http')
            ? mainFile
            : `file://${path.resolve(appPath, mainFile)}`;

        logger.info(`[${appId}] Loading URL: ${loadUrl}`);

        // 加载应用内容
        appWin.loadURL(loadUrl).catch(err => {
            logger.error(`[${appId}] Failed to load URL: ${err}`);
            if (appWin) appWin.close();
        });

        appWin.setMenu(null);
        if (process.platform === 'win') {
            appWin.setAppDetails({ appId: appId });
        }

        setupExternalUrlHandler(appWin, appJson.type === 'webapp');

        // WebApp 导航增强
        if (appJson.type === 'webapp') {
            const { setupWebAppNavigation } = require('@modules/web-app/web-app-navigator');
            setupWebAppNavigation(appWin);
        }

        // 错误处理
        appWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            logger.error(`[${appId}] Failed to load: ${errorCode} - ${errorDescription}`);
        });

        appWin.webContents.on('did-finish-load', () => {
            logger.info(`[${appId}] did-finish-load`);

            // 页面加载完成后、显示之前设置最大化状态（避免闪烁）
            if (state?.isMax) {
                appWin.maximize();
            }

            // Wayland 环境下 ready-to-show 可能不触发，设置 fallback 兜底显示
            readyToShowFallbackTimer = setTimeout(() => {
                if (!appWin.isDestroyed() && !appWin.isVisible()) {
                    logger.info(`[${appId}] Fallback: ready-to-show not triggered, forcing show window`);
                    appWin.show();
                }
            }, 1000);
        });

        // 准备显示
        appWin.on('ready-to-show', () => {
            // 清除 fallback 定时器，避免重复显示
            if (readyToShowFallbackTimer) {
                clearTimeout(readyToShowFallbackTimer);
                readyToShowFallbackTimer = null;
            }

            logger.info(`[${appId}] ready-to-show`);
            if (!state?.isMax) {
                appWin.show();
            }
            // 优先使用命令行参数的 devTools，其次使用 uatDev 配置
            if (devTools) {
                appWin.webContents.openDevTools({ mode: devTools });
            } else if (devTag && uatDevJson?.devTools) {
                appWin.webContents.openDevTools({ mode: uatDevJson?.devTools });
            }
        });

        // 窗口关闭时保存状态
        appWin.on('close', () => {
            // 通知渲染进程
            if (appWin.webContents) {
                appWin.webContents.send('window-close-callback');
            }

            // 保存窗口状态
            const bounds = appWin.getBounds();
            const isMax = appWin.isMaximized();
            winState.save(appId, {
                restore: 1,
                isMax,
                position: isMax ? state?.position : bounds
            }, () => {
                logger.info(`[${appId}] Window state saved`);
            });
        });

        // 窗口关闭时退出子进程
        appWin.on('closed', () => {
            logger.info(`[${appId}] Window closed, exiting subprocess`);
            app.quit();
        });

        logger.info(`[childprocess] App window created for ${appId}`);
    } catch (error) {
        logger.error('[childprocess] Failed to create app window:', error.message);
        logger.error('[childprocess] Error stack:', error.stack);
        app.quit();
    }
}
