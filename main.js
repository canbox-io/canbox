const { app, BrowserWindow, screen } = require('electron')
const fs = require('fs');
const path = require('path')

// 检查是否为子进程模式
if (process.env.CANBOX_ENTRY === 'childprocess') {
    // 子进程模式：退出主进程逻辑
    const childprocessEntry = require('./childprocessEntry');
    return;
}

const moduleAlias = require('module-alias');



// 手动添加映射（基于打包后的路径）
moduleAlias.addAliases({
    '@': path.join(__dirname, './src'),
    '@modules': path.join(__dirname, './modules')
});
// 注册别名（必须在 require 其他模块前执行）
moduleAlias();

const logger = require('@modules/utils/logger');
const { getCanboxStore } = require('@modules/canbox/main/storageManager');
const ModeDetector = require('@modules/canbox/execution/modeDetector');
const { getAutoUpdater } = require('@modules/canbox/update-center');

const tray = require('./tray');
const uatDev = (() => {
    try {
        // 在 asar 包中使用绝对路径
        const uatDevPath = path.join(__dirname, 'uat.dev.json');
        if (fs.existsSync(uatDevPath)) {
            return require(uatDevPath);
        }
        return {};
    } catch (error) {
        logger.warn('Failed to load uat.dev configuration: {}', error.message);
        return {};
    }
})();
logger.info('[main.js] uatDev: {}', JSON.stringify(uatDev));

// 引入 RepoMonitorService
const RepoMonitorService = require('@modules/canbox/services/repoMonitorService');

const appLoader = require('@modules/canbox/main/appLoader');
const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');
const processBridge = require('@modules/canbox/childprocess/processBridge');

// 引入 IPC 消息处理模块
const { initIpcHandlers } = require('./ipcHandlers');

// 清除启动时控制台的"Electron Security Warning (Insecure Content-Security-Policy)"报错信息
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

// 强制退出标志位：用于更新时绕过窗口关闭拦截
let isForceQuit = false;

// 开机自动启动标志（由 --autostart 参数设置）
let isAutostart = false;

// 禁用当前应用程序的硬件加速
app.disableHardwareAcceleration();

// 操作系统类型
const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux';

// canbox 主窗口对象
let win = null;

// 保存窗口状态的公共函数
function saveWindowState() {
    if (!win || win.isDestroyed()) return;

    const bounds = win.getBounds();
    const canboxStore = getCanboxStore();
    if (win.isMaximized()) {
        canboxStore.set('isMaximized', true);
        // 不删除 windowBounds，保留上次的非最大化状态
        // 这样点击"还原"按钮时可以恢复到上次的非最大化窗口状态
    } else {
        canboxStore.set('isMaximized', false);
        canboxStore.set('windowBounds', win.getBounds());
    }

    console.log('[main.js] Window bounds saved:', bounds);
    logger.info('[main.js] Window state saved to canbox.json, isMaximized: {}, bounds: {}',
        win.isMaximized(), JSON.stringify(bounds));
}

const isDev = !app.isPackaged;
console.info('main.js is running in %s mode', isDev ? 'development' : 'production');

// 创建锁，为了便于开发：正式环境仅一个实例，可同时多开多个开发环境
const getTheLock = isDev ? true : app.requestSingleInstanceLock();
if (!getTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        logger.info('second-instance triggered: {}', JSON.stringify(commandLine));

        // 检查是否为子进程触发的 second-instance
        // 子进程的最后一个参数通常是 childprocessEntry.js 或包含 --app-path
        const lastArg = commandLine[commandLine.length - 1] || '';
        const isChildprocessTrigger = commandLine.some(arg => arg.includes('childprocessEntry.js'));

        if (isChildprocessTrigger) {
            logger.info('Ignoring second-instance triggered by child process');
            return;
        }

        // 解析 --app-id 和 --dev-tools 参数
        let appId = '';
        let isDevTag = false;
        let devTools = null;
        for (const command of commandLine) {
            if (command.startsWith('--app-id=')) {
                appId = command.split('=')[1];
            } else if (command === '--dev-tag') {
                isDevTag = true;
            } else if (command.startsWith('--dev-tools=')) {
                const value = command.split('=')[1];
                // 验证 dev-tools 值是否有效，无效则默认为 'detach'
                const validModes = ['right', 'bottom', 'undocked', 'detach'];
                devTools = value && validModes.includes(value) ? value : 'detach';
            } else if (command === '--dev-tools') {
                // --dev-tools 没有值，默认为 'detach'
                devTools = 'detach';
            }
        }

        if (appId) {
            logger.info('Loading app {} from second-instance, devTag: {}, devTools: {}', appId, isDevTag, devTools);
            // 延迟执行，确保主窗口已完全初始化
            setTimeout(() => {
                if (!win || win.isDestroyed()) {
                    logger.warn('Main window not available, retrying...');
                    // 如果窗口不可用，等待 app.whenReady()
                    app.whenReady().then(() => {
                        appLoader.loadApp(appId, isDevTag, devTools);
                    });
                } else {
                    appLoader.loadApp(appId, isDevTag, devTools);
                }
            }, 100);
        } else if (win && !win.isDestroyed()) {
            // 没有 --app-id 参数，只是激活主窗口
            if (win.isMinimized()) win.restore();
            if (!win.isVisible()) win.show();
            win.focus();
            // 如果有 --dev-tools 参数，打开主窗口的开发者工具
            if (devTools) {
                win.webContents.openDevTools({ mode: devTools });
            }
        }
    })

    app.whenReady().then(() => {
        // 配置日志文件 appenders
        const { configureFileAppenders, cleanupOldLogs } = require('@modules/utils/logger');
        configureFileAppenders();

        // 执行日志清理（使用配置的保留天数）
        const store = getCanboxStore();
        const retentionDays = store.get('logRetentionDays', 30);
        cleanupOldLogs(retentionDays);
        logger.info('[main.js] Log cleanup executed with retention days: {}', retentionDays);

        // 清理遗留的文件任务临时目录
        const FileTaskManager = require('@modules/canbox/file-task/file-task-manager');
        FileTaskManager.getInstance().cleanupStaleTasks().then(result => {
            logger.info('[main.js] 遗留临时目录清理完成, cleaned={}, errors={}', result.cleaned.length, result.errors.length);
        }).catch(err => {
            logger.error('[main.js] 清理遗留临时目录失败: {}', err.message);
        });

        // 加载持久化的文件任务
        FileTaskManager.getInstance().loadPersistedTasks().then(result => {
            logger.info('[main.js] 持久化任务加载完成, loaded={}, interrupted={}', result.loaded, result.interrupted);
        }).catch(err => {
            logger.error('[main.js] 加载持久化任务失败: {}', err.message);
        });

        // 初始化执行调度器
        executionDispatcher.init();

        // 主进程模式：创建主窗口
        createWindow();
        win.setIcon(path.join(__dirname, './logo.png'));

        // 初始化主进程 IPC 桥接
        processBridge.initMain();

        // 将保存函数注入到 tray
        tray.setSaveWindowStateFn(saveWindowState);

        // 创建托盘
        tray.createTray(win);

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });

        // 初始化并启动仓库监控服务
        const repoMonitorService = new RepoMonitorService();
        repoMonitorService.startScheduler('0 * * * *'); // 每小时执行一次
        // repoMonitorService.startScheduler('*/1 * * * *'); // 每分钟执行一次

        // 启动时立即执行一次仓库检查
        repoMonitorService.scanRepo().then((ret) => {
            logger.info('启动时仓库检查完成');
            // 通知前端数据已更新
            if (ret.success) {
                win.webContents.send('repo-data-updated');
            }
        }).catch(error => {
            logger.error('启动时仓库检查失败:', error);
        });

        // 初始化启动器（异步）
        if (!isDev) {
            const appLauncherManager = require('./modules/canbox/main/appLauncherManager');
            const { getAllApps } = require('./modules/canbox/main/appManager');
            const package = require('./package.json');
            appLauncherManager.initLaunchers(package.version, getAllApps().data || {}).then((result) => {
                if (result.success) {
                    logger.info('快捷方式初始化完成' + result.msg || '');
                } else {
                    logger.error('快捷方式初始化失败:', result.msg);
                }
            }).catch((error) => {
                logger.error('快捷方式初始化失败:', error);
            });
        }

        // app第一次启动的时候，启动参数可以从process.argv里面获取到
        let appId = '';
        let isDevTag = false;
        let devTools = null;
        for (let arg of process.argv) {
            if (arg.indexOf('--app-id=') !== -1) {
                appId = arg.substring(arg.indexOf('=') + 1);
            } else if (arg.indexOf('--dev-tools=') !== -1) {
                const value = arg.substring(arg.indexOf('=') + 1);
                // 验证 dev-tools 值是否有效，无效则默认为 'detach'
                const validModes = ['right', 'bottom', 'undocked', 'detach'];
                devTools = value && validModes.includes(value) ? value : 'detach';
            } else if (arg === '--dev-tools') {
                // --dev-tools 没有值，默认为 'detach'
                devTools = 'detach';
            }
        }
        if (process.argv.includes('--dev-tag')) {
            isDevTag = true;
        }
        if (process.argv.includes('--autostart')) {
            isAutostart = true;
            logger.info('[main.js] Autostart mode detected (--autostart)');
        }

        if ('' !== appId) {
            console.info('First-time startup with appId:', appId, 'devTag:', isDevTag, 'devTools:', devTools);
            logger.info('[main.js] First-time startup with appId: {}, devTag: {}, devTools: {}', appId, isDevTag, devTools);
            // 延迟执行，尽快启动目标 APP
            // 注意：不在这里调用 win.hide()，窗口创建时已是 show: false 不会显示
            // 提前 hide 会破坏渲染器初始化（X11 compositor 不再为隐藏窗口合成首帧）
            // 后续 ready-to-show 或 fallback 会统一处理窗口的显示/隐藏逻辑
            setTimeout(() => {
                if (win && !win.isDestroyed()) {
                    appLoader.loadApp(appId, isDevTag, devTools);
                } else {
                    logger.warn('[main.js] Main window not ready for app loading, skipping');
                }
            }, 200);
        }
    })
}

app.on('window-all-closed', async () => {
    // if (process.platform !== 'darwin') app.quit();
    if (process.platform !== 'darwin') {
        console.info('now will quit app');
        app.quit();
        console.info('now after quit app');
    }
});

// 应用退出前保存窗口位置和大小
app.on('before-quit', () => {
    saveWindowState();

    // 停止所有子进程
    executionDispatcher.closeAllApps();

    // 设置强制退出标志，允许窗口真正关闭
    isForceQuit = true;
});

const createWindow = () => {
    // 从 canbox.json 恢复窗口状态
    const canboxStore = getCanboxStore();
    const isMaximized = canboxStore.get('isMaximized', false);
    const savedBounds = canboxStore.get('windowBounds', {
        x: undefined,
        y: undefined,
        width: 700,
        height: 550
    });

    // 获取屏幕信息，确保窗口在可见区域
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;

    let { x, y, width, height } = savedBounds;

    // 检查窗口是否在屏幕范围内（使用更宽松的条件，至少窗口的左上角和部分区域在屏幕内）
    const isPositionValid = !isMaximized && x !== undefined && y !== undefined &&
        x >= 0 && y >= 0 &&
        x < screenWidth && y < screenHeight;

    // 如果位置无效，使用默认值（屏幕居中）
    if (!isPositionValid && !isMaximized) {
        x = undefined;
        y = undefined;
        width = 700;
        height = 550;
    }

    logger.info('[main.js] Restoring window state: isMaximized={} x={}, y={}, width={}, height={}, isPositionValid={}',
        isMaximized, x, y, width, height, isPositionValid);

    let config = {
        minWidth: 750,
        minHeight: 550,
        width: width,
        height: height,
        resizable: true,
        icon: path.join(__dirname, './logo.png'),
        webPreferences: {
            sandbox: false, // 因为在preload中使用nodejs的api（如：require）
            // 即使 preload.js 中只是简单地引入 electron 模块，也需要 require 的支持
            // 所以这里设置为false禁用了沙箱模式，并且在启动参数中使用 --no-sandbox
            preload: path.join(__dirname, './preload.js'),
            spellcheck: false,
            webSecurity: false,
            nodeIntegration: false, // false：禁止渲染进程使用nodejs的api
            contextIsolation: true,
            allowRunningInsecureContent: false,
            allowEval: false
        },
        useContentSize: true,
        show: false,
        autoHideMenuBar: true
    };

    // 只在位置有效时设置 x 和 y（即使是最大化状态，也需要先设置位置）
    if (isPositionValid) {
        config.x = x;
        config.y = y;
    }

    if (os === 'linux') {
        // 为Wayland环境提供更好的窗口识别支持
        config.windowClass = 'canbox-main';
        config.title = 'Canbox';
        config.titleBarStyle = 'default';
        // 确保主进程WM_CLASS正确设置
        if (!config.webPreferences) config.webPreferences = {};
        config.webPreferences.additionalArguments = [
            `--app-name=Canbox`,
            `--class=canbox-main`,
            `--wm-class=canbox-main`
        ];
    }
    console.info('config: ', config);
    win = new BrowserWindow(config);
    console.info('win.isMaximized(): ', win.isMaximized());

    if (isDev && uatDev?.main) {
        logger.info('[main.js] now load canbox in uatDev: {}', uatDev.main);
        win.loadURL(uatDev.main);
    } else {
        const indexPath = path.join(__dirname, './build/index.html');
        console.info('now load app==%s', indexPath);
        win.loadURL(require('url').format({
            pathname: indexPath,
            protocol: 'file:',
            slashes: true
        }));
    }

    // win.setMenu(Menu.buildFromTemplate(menuTemplate));
    win.setMenu(null);

    // 添加错误处理，监控加载失败的情况
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load:', errorCode, errorDescription);
        logger.error('Failed to load: {} - {}', errorCode, errorDescription);
    });

    // Fallback 定时器 ID，用于 Wayland 等环境下 ready-to-show 不触发的兜底
    let readyToShowFallbackTimer = null;

    // 解析首次启动的 --app-id 参数（提前到 createWindow 作用域，供 fallback 和 ready-to-show 共用）
    let launchAppId = null;
    for (const arg of process.argv) {
        if (arg.startsWith('--app-id=')) {
            launchAppId = arg.split('=')[1];
            break;
        }
    }

    // 添加页面加载完成后的日志
    win.webContents.on('did-finish-load', () => {
        console.log('Page loaded successfully');
        logger.info('Page loaded successfully');

        // 页面加载完成后、显示之前设置最大化状态（避免闪烁）
        if (isMaximized) {
            win.maximize();
        }

        // 应用保存的缩放比例
        try {
            const canboxStore = getCanboxStore();
            const zoomFactor = canboxStore.get('zoomFactor', 1.0);
            win.webContents.setZoomFactor(zoomFactor);
            logger.info('Applied zoom factor: {}', zoomFactor);
        } catch (error) {
            logger.error('Failed to apply zoom factor:', error);
        }

        // Wayland 等环境下 ready-to-show 可能不触发，设置 fallback 兜底显示
        // 如果 ready-to-show 先触发，会清除这个定时器
        readyToShowFallbackTimer = setTimeout(() => {
            if (!win.isDestroyed() && !win.isVisible()) {
                // --app-id 启动时主窗口不应显示，跳过 fallback 的 show 操作
                if (launchAppId) {
                    win.setSkipTaskbar(true);
                    logger.info('[main.js] Fallback: ready-to-show not triggered, skipping show (--app-id mode, appId: {})', launchAppId);
                    return;
                }
                logger.info('[main.js] Fallback: ready-to-show not triggered, forcing show window');
                win.show();
            }
        }, 1000);
    });

    // 添加 console 日志输出到主进程
    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer Console] ${message}`);
    });

    if (os === 'win') {
        win.setAppDetails({
            appId: 'canbox'
        });
    }

    win.on('ready-to-show', () => {
        // 清除 fallback 定时器，避免重复显示
        if (readyToShowFallbackTimer) {
            clearTimeout(readyToShowFallbackTimer);
            readyToShowFallbackTimer = null;
        }

        const PackageJson = require('./package.json');
        const devTitle = isDev ? ' - develop' : '';
        win.setTitle(`${PackageJson.description} - v${PackageJson.version}${devTitle}`);

        if (launchAppId) {
            // 指定 APP 启动：主窗口不显示，启动到 tray，直接加载 APP
            win.hide();
            win.setSkipTaskbar(true);
            appLoader.loadApp(launchAppId, false, null);
        } else if (isAutostart) {
            // 开机自动启动：不显示主窗口，最小化到托盘
            win.hide();
            win.setSkipTaskbar(true);
            logger.info('[main.js] Autostart mode: window hidden to tray');
        } else {
            win.show();
        }

        // 检查是否传入了 --dev-tools 参数
        let devToolsMode = null;
        for (const arg of process.argv) {
            if (arg.startsWith('--dev-tools=')) {
                const value = arg.split('=')[1];
                // 验证 dev-tools 值是否有效，无效则默认为 'detach'
                const validModes = ['right', 'bottom', 'undocked', 'detach'];
                devToolsMode = value && validModes.includes(value) ? value : 'detach';
                break;
            } else if (arg === '--dev-tools') {
                // --dev-tools 没有值，默认为 'detach'
                devToolsMode = 'detach';
                break;
            }
        }
        // 优先使用命令行参数，其次使用 uatDev 配置
        if (devToolsMode) {
            win.webContents.openDevTools({ mode: devToolsMode });
        } else if (isDev && uatDev?.devTools) {
            win.webContents.openDevTools({ mode: uatDev?.devTools });
        }
        // win.webContents.openDevTools({ mode: 'detach' });
    });

    // 将app窗口添加到appMap中
    // windowManager.addWindow('canbox', win);

    // 关闭主窗口事件，最小化到托盘，同时保存窗口状态
    win.on('close', (e) => {
        // 强制退出时，允许窗口关闭
        if (isForceQuit) {
            return;
        }

        // 正常关闭时，隐藏窗口到托盘
        saveWindowState();
        win.hide();
        win.setSkipTaskbar(true);
        e.preventDefault();
    });

    // 在 win 的closed事件里退出整个app，同时保存窗口位置和大小
    win.on('closed', async () => {
        // 注意：close 事件已经保存过了，这里不需要重复保存
        console.info('now win closed, and app will quit');
        // 清除强制退出标志位，防止下次关闭也被当作强制退出
        isForceQuit = false;
        app.quit();
    });

    // 初始化自动更新管理器
    initAutoUpdate();
}

/**
 * 初始化自动更新功能
 *
 * 功能说明：
 * - 仅在生产环境（打包后）启用自动更新
 * - 开发环境跳过更新检查，避免干扰开发
 * - 延迟 5 秒检查更新，避免影响启动速度
 */
function initAutoUpdate() {
    try {
        // 生产环境检测
        // app.isPackaged 在打包后返回 true，开发环境返回 false
        if (!app.isPackaged) {
            logger.info('[AutoUpdate] 开发环境，跳过自动更新检查');
            return;
        }

        // 获取主窗口（第一个窗口）
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
            logger.warn('[AutoUpdate] 主窗口未找到，跳过自动更新初始化');
            return;
        }

        // 获取自动更新管理器实例
        const updateManager = getAutoUpdater();
        updateManager.setMainWindow(mainWindow);

        // 延迟检查更新，避免影响启动速度
        setTimeout(async () => {
            try {
                logger.info('[AutoUpdate] 开始启动时更新检查');
                // 设置启动时检查标志
                updateManager.setStartupCheck(true);

                // 添加 30 秒超时包装
                const checkPromise = updateManager.checkForUpdates();
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('Update check timeout (30s)'));
                    }, 30000); // 30 秒超时
                });

                const result = await Promise.race([checkPromise, timeoutPromise]);
                logger.info('[AutoUpdate] 启动时更新检查完成，结果: {}', JSON.stringify(result));
                // 检查完成后重置标志
                updateManager.setStartupCheck(false);
            } catch (error) {
                logger.error('[AutoUpdate] 启动时更新检查失败: {}', error.message);
                logger.error('[AutoUpdate] 错误堆栈: {}', error.stack);
                // 确保重置标志
                updateManager.setStartupCheck(false);
            }
        }, 5000); // 延迟 5 秒

        logger.info('[AutoUpdate] 自动更新管理器已初始化');
    } catch (error) {
        logger.error('[AutoUpdate] 初始化自动更新管理器失败: {}', error.message);
    }
}

// 初始化 IPC 消息处理（包含语言初始化）
initIpcHandlers();
