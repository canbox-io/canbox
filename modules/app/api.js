const { ipcMain, app, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const logger = require('@modules/utils/logger');

const winFactory = require('@modules/app/core/win');
const dialogFactory = require('@modules/app/core/dialog');
const ElectronStore = require('@modules/app/core/electronStore');
const DB = require('@modules/app/core/db');
const { getCanboxStore } = require('@modules/canbox/main/storageManager');

/**
 * 获取 canbox 当前语言设置
 * 从 canbox store 中读取，支持 Window 模式和 Childprocess 模式
 * Childprocess 模式下通过 CANBOX_USER_DATA 环境变量确保路径正确
 * @returns {string} 当前语言代码
 */
function getCanboxLanguage() {
    try {
        const canboxStore = getCanboxStore();
        const savedLanguage = canboxStore.get('language');
        if (savedLanguage) {
            return savedLanguage;
        }
    } catch (error) {
        logger.error('[api.js] Failed to get language from canbox store:', error);
    }

    // 默认根据系统语言
    const systemLocale = app.getLocale();
    return systemLocale.startsWith('zh') ? 'zh-CN' : 'en-US';
}

/**
 * 初始化 i18n 相关的 IPC 消息处理逻辑
 * @description 处理来自 App 的语言相关请求
 */
function initI18nIpcHandlers() {
    // 获取当前语言（同步）
    ipcMain.on('i18n-get-locale', (event) => {
        const language = getCanboxLanguage();
        logger.debug('[api.js] i18n-get-locale: returning {}', language);
        event.returnValue = language;
    });
}

/**
 * 初始化数据库相关的 IPC 消息处理逻辑
 */
function initDbIpcHandlers() {
    ipcMain.on('msg-db', (event, args) => {
        logger.debug('args / 参数:', JSON.stringify(args));
        DB[args.type](args.appId, args.param, (res, err) => {
            if (err) {
                event.returnValue = JSON.stringify({ success: false, msg: err.message });
                return;
            }
            logger.debug('api.js: dbHandler res / api.js 数据库处理结果:', JSON.stringify(res));
            event.returnValue = JSON.stringify({ success: true, data: res});
        });
    });
}

/**
 * 初始化 electronStore 相关的 IPC 消息处理逻辑
 * @description 处理来自渲染进程的 IPC 消息，操作 electronStore
 * @listens ipcMain.on('msg-electronStore')
 * @param {object} args - IPC 消息参数
 * @param {string} args.type - 操作类型，支持 'get'、'set'、'delete'、'clear'
 * @param {object} args.param - 参数对象
 * @param {string} args.param.name - 存储的名称
 * @param {string} args.param.key - 存储的键
 * @param {any} [args.param.value] - 存储的值（仅 'set' 操作需要）
 * @param {string} args.appId - 应用 ID，用于动态生成存储路径
 * @returns {void}
 * @emits event.returnValue - 返回操作结果，格式为 { success: boolean, data: any }
 */
function initElectronStoreIpcHandlers() {
    ipcMain.on('msg-electronStore', (event, args) => {
        logger.debug('args / 参数:', JSON.stringify(args));
        const store = new ElectronStore(args.appId, args.param.name);
        store[args.type](args.param.key, args.param.value)
            .then(result => {
                event.returnValue = JSON.stringify({ success: true, data: result });
            })
            .catch(err => {
                event.returnValue = JSON.stringify({ success: false, msg: err.message });
            });
    });
}

/**
 * 初始化窗口相关的 IPC 消息处理逻辑
 * @description 处理来自渲染进程的 IPC 消息，创建新窗口
 * @listens ipcMain.on('msg-createWindow')
 * @param {object} args - IPC 消息参数
 * @param {object} args.options - 窗口配置选项
 * @param {object} args.params - 窗口参数
 * @param {string} args.appId - 应用 ID
 * @returns {void}
 * @emits event.returnValue - 返回创建窗口的id，格式为 id: string
 */
function createWindowIpcHandlers() {
    ipcMain.on('msg-createWindow', (event, args) => {
        logger.debug('args / 参数:', JSON.stringify(args));
        const result = winFactory.createWindow(args.options, args.params, args.appId);
        logger.debug('result / 结果:', JSON.stringify(result));
        event.returnValue = JSON.stringify(result);
    });
}

/**
 * 初始化通知相关的 IPC 消息处理逻辑
 * @listens ipcMain.on('msg-notification')
 * @param {object} args - IPC 消息参数
 * @param {object} args.options - 通知配置选项
 * @param {string} args.options.title - 通知标题
 * @param {string} args.options.body - 通知内容
 * @param {string} args.appId - 应用 ID
 * @returns {void}
 * @emits event.returnValue - 返回通知创建结果，格式为 { success: boolean, data: any }
 */
function notificationHandlers() {
    ipcMain.on('msg-notification', (event, args) => {
        logger.debug('args / 参数:', JSON.stringify(args));
        winFactory.showNotification(args.options, args.appId);
    });
}

/**
 * 初始化对话框相关的 IPC 消息处理逻辑
 * @description 处理来自渲染进程的 IPC 消息，操作对话框（如打开文件、保存文件等）
 * @listens ipcMain.on('msg-dialog')
 * @param {object} args - IPC 消息参数
 * @param {string} args.type - 对话框操作类型，支持 'openFile'、'saveFile' 等
 * @param {object} args.options - 对话框配置选项
 * @returns {void}
 * @emits event.returnValue - 返回对话框操作结果，格式为 { success: boolean, data: any }
 */
function initDialogIpcHandlers() {
    ipcMain.on('msg-dialog', (event, args) => {
        logger.debug('args / 参数:', JSON.stringify(args));
        dialogFactory[args.type](args.options)
            .then(result => {
                event.returnValue = JSON.stringify({ success: true, data: result });
            })
            .catch(err => {
                event.returnValue = JSON.stringify({ success: false, msg: err.message });
            });
    });
}

/**
 * 初始化 sudo 相关的 IPC 消息处理逻辑
 * @description 处理来自渲染进程的 IPC 消息，执行需要提权的命令
 * @listens ipcMain.handle('msg-sudo')
 * @param {object} args - IPC 消息参数
 * @param {object} args.options - 提权选项（包含 command 和 name）
 * @param {string} args.appId - 应用 ID
 * @returns {Promise} 返回执行结果，格式为 { success: boolean, data: object }
 */
function initSudoIpcHandlers() {
    const sudo = require('@modules/app/core/sudo');
    ipcMain.handle('msg-sudo', async (event, args) => {
        try {
            const result = await sudo.exec(args.options);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            logger.error('[IPC msg-sudo] failed: {}', error.message);
            return {
                success: false,
                msg: error.message
            };
        }
    });
}

/**
 * 初始化文件读取相关的 IPC 消息处理逻辑
 * @description 处理来自渲染进程的 IPC 消息，读取文件内容
 * @listens ipcMain.handle('msg-readFile')
 * @param {object} args - IPC 消息参数
 * @param {string} args.filePath - 文件路径
 * @returns {Promise} 返回文件内容，格式为 { success: boolean, data: string }
 */
function initReadFileIpcHandlers() {
    ipcMain.handle('msg-readFile', async (event, args) => {
        try {

            // 获取应用路径：开发环境使用项目根目录，打包后使用 app.getAppPath()
            let appPath = app.isPackaged ? app.getAppPath() : path.join(__dirname, '../../');

            // 构建完整的文件路径
            const filePath = path.join(appPath, args.filePath);

            logger.debug('[api.js] 尝试读取文件 / Attempting to read file: {}', filePath);

            // 检查文件是否存在
            if (!fs.existsSync(filePath)) {
                logger.error('[api.js] 文件不存在 / File does not exist: {}', filePath);
                return {
                    success: false,
                    msg: `文件不存在: ${args.filePath}`
                };
            }

            // 读取文件内容
            const content = fs.readFileSync(filePath, 'utf8');
            logger.debug('[api.js] 文件读取成功 / File read successfully: {}', args.filePath);
            return {
                success: true,
                data: content
            };
        } catch (error) {
            logger.error('[api.js] 读取文件失败 / Failed to read file: {}', error.message || error);
            return {
                success: false,
                msg: `读取文件失败: ${error.message}`
            };
        }
    });
}

/**
 * 初始化下载 canbox.d.ts 的 IPC 消息处理逻辑
 * @description 处理来自渲染进程的下载 canbox.d.ts 请求
 * @listens ipcMain.handle('download-canbox-types')
 * @returns {Promise} 返回下载结果，格式为 { success: boolean, msg: string }
 */
function initDownloadCanboxTypesIpcHandlers() {
    ipcMain.handle('download-canbox-types', async () => {
        try {

            // 获取应用路径：开发环境使用项目根目录，打包后使用 app.getAppPath()
            let appPath = app.isPackaged ? app.getAppPath() : path.join(__dirname, '../../');

            logger.info('[api.js] app.isPackaged = ' + app.isPackaged);
            logger.info('[api.js] __dirname = ' + __dirname);
            logger.info('[api.js] appPath = ' + appPath);

            // canbox.d.ts 文件路径
            // 打包后 types 目录在 resources/types，开发环境在 types
            let canboxTypesPath;
            if (app.isPackaged) {
                // 打包后：types 目录在 resources/types（extraResources）
                const resourcesPath = path.join(process.resourcesPath, 'types', 'canbox.d.ts');
                const asarPath = path.join(appPath, 'types', 'canbox.d.ts');
                logger.info('[api.js] resourcesPath = ' + resourcesPath);
                logger.info('[api.js] asarPath = ' + asarPath);

                // 优先尝试 resources 目录（extraResources）
                if (fs.existsSync(resourcesPath)) {
                    canboxTypesPath = resourcesPath;
                } else if (fs.existsSync(asarPath)) {
                    canboxTypesPath = asarPath;
                } else {
                    canboxTypesPath = resourcesPath; // 默认使用 resources 路径
                }
            } else {
                // 开发环境
                canboxTypesPath = path.join(appPath, 'types', 'canbox.d.ts');
            }
            logger.info('[api.js] canboxTypesPath = ' + canboxTypesPath);

            // 检查文件是否存在
            if (!fs.existsSync(canboxTypesPath)) {
                logger.error('[api.js] canbox.d.ts 文件不存在: ' + canboxTypesPath);
                return {
                    success: false,
                    msg: 'canbox.d.ts 文件不存在'
                };
            }

            // 打开文件保存对话框
            const result = await dialog.showSaveDialog({
                title: '保存 canbox.d.ts',
                defaultPath: 'canbox.d.ts',
                filters: [
                    { name: 'TypeScript Declaration Files', extensions: ['d.ts'] }
                ]
            });

            if (result.canceled || !result.filePath) {
                logger.info('[api.js] 用户取消保存 canbox.d.ts');
                return {
                    success: true,
                    msg: 'canceled'
                };
            }

            // 读取 canbox.d.ts 文件内容（Electron 的 fs 已支持 asar）
            const content = fs.readFileSync(canboxTypesPath, 'utf8');

            // 写入用户选择的路径
            fs.writeFileSync(result.filePath, content);

            logger.info('[api.js] canbox.d.ts 保存成功: ' + result.filePath);
            return {
                success: true,
                msg: '保存成功'
            };
        } catch (error) {
            logger.error('[api.js] 下载 canbox.d.ts 失败 / Failed to download canbox.d.ts: {}', error.message || error);
            return {
                success: false,
                msg: `下载失败: ${error.message}`
            };
        }
    });
}

function initOpenUrlIpcHandlers() {
    ipcMain.on('msg-openUrl', (event, args) => {
        const url = args.url;
        if (!url) {
            logger.warn('[api.js] msg-openUrl received empty url');
            event.returnValue = JSON.stringify({ success: false, msg: 'url is required' });
            return;
        }
        logger.info('[api.js] Opening external URL: {}', url);
        shell.openExternal(url).then(() => {
            event.returnValue = JSON.stringify({ success: true });
        }).catch(err => {
            logger.error('[api.js] Failed to open external URL: {}', err.message);
            event.returnValue = JSON.stringify({ success: false, msg: err.message });
        });
    });
}

/**
 * 统一初始化所有 IPC 消息处理逻辑
 */
function initApiIpcHandlers() {
    initDbIpcHandlers();
    createWindowIpcHandlers();
    notificationHandlers();
    initDialogIpcHandlers();
    initElectronStoreIpcHandlers();
    initReadFileIpcHandlers();
    initDownloadCanboxTypesIpcHandlers();
    initSudoIpcHandlers();
    initI18nIpcHandlers();
    initOpenUrlIpcHandlers();
}

module.exports = initApiIpcHandlers;
