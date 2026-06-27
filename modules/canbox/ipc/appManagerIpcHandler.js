const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const originalFs = require('original-fs');
const { shell } = require('electron');
const { getAppsStore, getAppsDevStore } = require('@modules/canbox/main/storageManager');
const { getAppPath, getAppDataPath, getUserDataPath } = require('@modules/canbox/main/pathManager');
const { handleError } = require('@modules/canbox/ipc/errorHandler');
const logger = require('@modules/utils/logger');
const { handleImportApp, getAppInfo, getAppDevInfo } = require('@modules/canbox/main/appManager');
const { deleteLaunchers } = require('@modules/canbox/main/appLauncherManager');
const { syncReposDownloadStatus } = require('@modules/canbox/ipc/repoIpcHandler');
const i18nModule = require('../../../locales');
const { getCanboxStore } = require('@modules/canbox/main/storageManager');
const canboxDb = require('@modules/canbox/core/canboxDb');
const { fetchWebsiteInfo, downloadIcon } = require('@modules/canbox/web-app/website-scraper');
const { createWebApp } = require('@modules/canbox/web-app/web-app-creator');

/**
 * 计算目录大小（字节）
 * @param {string} dirPath - 目录路径
 * @returns {number} 目录大小（字节）
 */
function getDirSize(dirPath) {
    let size = 0;
    if (!fs.existsSync(dirPath)) return 0;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            size += getDirSize(filePath);
        } else {
            size += stat.size;
        }
    }
    return size;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小字符串
 */
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

// 获取当前语言
function getCurrentLanguage() {
    const canboxStore = getCanboxStore();
    return canboxStore.get('language') || 'en-US';
}

const translate = (key) => i18nModule.translate(key, getCurrentLanguage());

/**
 * 处理 app-export 任务
 * @param {Object} task - 任务对象
 */
async function handleAppExportTask(task) {
    const FileTaskManager = require('@modules/canbox/file-task/file-task-manager');
    const taskManager = FileTaskManager.getInstance();
    const { execSync } = require('child_process');

    const uid = task.uid;
    const savePath = task.options.savePath;

    logger.info('Exporting app: {}, saveTo: {}', uid, savePath);

    try {
        taskManager.updateProgress(task.id, 10, '准备导出...', 0);

        const appsData = getAppsStore().get('default') || {};
        const appItem = appsData[uid];
        if (!appItem) {
            throw new Error('应用不存在');
        }

        const appName = appItem.appJson?.name || appItem.name || uid;
        const version = appItem.appJson?.version || appItem.version || '';
        const appId = appItem.appJson?.id || appItem.id || uid;

        taskManager.updateProgress(task.id, 20, '读取应用文件...', 0);

        const appPath = getAppPath();
        const asarPath = path.join(appPath, `${uid}.asar`);
        const unpackedPath = path.join(appPath, `${uid}.asar.unpacked`);

        logger.info('Reading asar file: {}', asarPath);
        if (!originalFs.existsSync(asarPath)) {
            throw new Error(`应用文件不存在: ${uid}.asar`);
        }

        taskManager.updateProgress(task.id, 30, '复制应用文件...', 0);

        const hasUnpacked = originalFs.existsSync(unpackedPath);
        if (hasUnpacked) {
            logger.info('Found .asar.unpacked directory: {}', unpackedPath);
        }

        const tmpAsarPath = path.join(task.tempPath, `${uid}.asar`);
        originalFs.copyFileSync(asarPath, tmpAsarPath);

        if (hasUnpacked) {
            fse.copySync(unpackedPath, path.join(task.tempPath, `${uid}.asar.unpacked`));
        }

        taskManager.updateProgress(task.id, 50, '打包中...', 0);

        logger.info('Creating zip package: {}', savePath);

        if (process.platform === 'win32') {
            execSync(`powershell -Command "Compress-Archive -Path '${task.tempPath}\\*' -DestinationPath '${savePath}' -Force"`, { stdio: 'inherit' });
        } else {
            execSync(`cd "${task.tempPath}" && zip -r "${savePath}" .`, { stdio: 'inherit' });
        }

        taskManager.updateProgress(task.id, 90, '导出完成...', 0);

        logger.info('App exported successfully: {} -> {}', appId, savePath);

        canboxDb.put({
            type: 'success',
            message: 'operationHistory.messages.appExportSuccess',
            params: { appName: appName, version: version },
            module: 'app',
            details: {
                appId: uid,
                version: version,
                exportPath: savePath
            }
        }, () => {});

        return { success: true };
    } catch (error) {
        logger.error('App export failed: {}, error: {}', uid, error.message);

        const appsData = getAppsStore().get('default') || {};
        const appItem = appsData[uid];
        const appName = appItem?.appJson?.name || appItem?.name || uid;

        canboxDb.put({
            type: 'error',
            message: 'operationHistory.messages.appExportFailed',
            params: { appName: appName, error: error.message },
            module: 'app',
            details: {
                appId: uid,
                error: error.message
            }
        }, () => {});

        throw error;
    }
}

class AppManagerIpcHandler {
    constructor() {
        this.handlers = new Map();
        this.registerHandlers();
    }

    registerHandlers() {
        // 获取所有应用（异步版本，避免阻塞主线程）
        this.handlers.set('get-all-apps', async () => {
            const startTime = Date.now();
            try {
                const appsData = getAppsStore().get('default') || {};
                const appCount = Object.keys(appsData).length;
                logger.info(`IPC get-all-apps: Starting to process ${appCount} apps`);
                
                if (appCount === 0) {
                    logger.info('当前没有应用数据');
                    return { success: true, data: {}};
                }

                // 使用异步并发读取所有应用的 app.json 文件
                const readStartTime = Date.now();
                const appPromises = Object.entries(appsData).map(async ([uid, appItem]) => {
                    try {
                        const appJsonPath = path.join(getAppPath(), uid + '.asar/app.json');
                        const appJsonContent = await fs.promises.readFile(appJsonPath, 'utf8');
                        const appJson = JSON.parse(appJsonContent);
                        const iconPath = path.join(getAppPath(), uid + '.asar', appJson.logo);
                        const appJsonData = { ...appJson, logo: iconPath };
                        return [uid, { ...appItem, appJson: appJsonData }];
                    } catch (error) {
                        logger.error(`Failed to read app.json for ${uid}:`, error);
                        return [uid, appItem]; // 保持原始 appItem
                    }
                });

                // 等待所有应用数据读取完成
                const resolvedApps = await Promise.all(appPromises);
                const readTime = Date.now() - readStartTime;
                
                // 重新构建 appsData 对象
                const buildStartTime = Date.now();
                const updatedAppsData = {};
                resolvedApps.forEach(([uid, appItem]) => {
                    updatedAppsData[uid] = appItem;
                });
                const buildTime = Date.now() - buildStartTime;

                const totalTime = Date.now() - startTime;
                logger.info(`IPC get-all-apps success: ${appCount} apps processed, read: ${readTime}ms, build: ${buildTime}ms, total: ${totalTime}ms`);
                return { success: true, data: updatedAppsData };
            } catch (error) {
                logger.error('IPC get-all-apps error:', error);
                return { success: false, msg: error.message };
            }
        });

        // 获取开发应用数据（异步版本，避免阻塞主线程）
        this.handlers.set('get-apps-dev-data', async () => {
            const startTime = Date.now();
            try {
                let appDevInfoData = getAppsDevStore().get('default') || {};
                const appCount = Object.keys(appDevInfoData).length;
                logger.info(`IPC get-apps-dev-data: Starting to process ${appCount} dev apps`);
                
                if (appCount === 0) {
                    return { success: true, data: {}, wrong: {} };
                }
                
                let appDevData = {};
                let appDevFalseData = {};
                
                // 使用异步并发读取，避免阻塞主线程
                const appPromises = Object.entries(appDevInfoData).map(async ([key, appInfo]) => {
                    try {
                        const appJsonPath = path.join(appInfo.path, 'app.json');
                        const appJsonContent = await fs.promises.readFile(appJsonPath, 'utf8');
                        const appJson = JSON.parse(appJsonContent);
                        
                        // 使用浅拷贝替代深拷贝，性能更好
                        appDevData[key] = { ...appInfo, appJson: { ...appJson } };
                        return { key, success: true };
                    } catch (error) {
                        appDevFalseData[key] = { ...appInfo };
                        return { key, success: false, error };
                    }
                });

                // 等待所有应用数据读取完成
                await Promise.all(appPromises);

                // 异步删除有问题的应用（不阻塞返回）
                if (Object.keys(appDevFalseData).length > 0) {
                    setImmediate(() => {
                        try {
                            for (const key in appDevFalseData) {
                                delete appDevInfoData[key];
                            }
                            getAppsDevStore().set('default', appDevInfoData);
                            logger.info('Cleaned up invalid dev apps:', Object.keys(appDevFalseData));
                        } catch (error) {
                            logger.error('Failed to cleanup invalid dev apps:', error);
                        }
                    });
                }
                
                const totalTime = Date.now() - startTime;
                logger.info(`IPC get-apps-dev-data success: ${appCount} dev apps processed, valid: ${Object.keys(appDevData).length}, invalid: ${Object.keys(appDevFalseData).length}, total: ${totalTime}ms`);
                return { success: true, data: appDevData, wrong: appDevFalseData };
            } catch (error) {
                logger.error('IPC get-apps-dev-data error:', error);
                return { success: false, msg: error.message, data: {}, wrong: {} };
            }
        });

        // 导入应用（从 zip 文件）
        this.handlers.set('import-app', async (event, zipPath) => {
            try {
                const ret = await handleImportApp(null, zipPath, null);
                return ret;
            } catch (error) {
                return handleError(error, 'import-app');
            }
        });

        // 导出应用（创建任务）
        this.handlers.set('export-app', async (event, uid, savePath) => {
            try {
                if (!uid) {
                    return handleError(new Error('应用 ID 不能为空'), 'export-app');
                }
                if (!savePath) {
                    return handleError(new Error('保存路径不能为空'), 'export-app');
                }

                const FileTaskManager = require('@modules/canbox/file-task/file-task-manager');
                const taskManager = FileTaskManager.getInstance();
                const task = await taskManager.createTask('app-export', uid, { savePath });
                return { success: true, taskId: task.id };
            } catch (error) {
                return handleError(error, 'export-app');
            }
        });

        // 选择导出保存路径
        this.handlers.set('select-export-path', async (event, defaultName) => {
            try {
                const { dialog } = require('electron');
                const result = await dialog.showSaveDialog({
                    title: translate('appList.exportApp'),
                    defaultPath: defaultName,
                    filters: [
                        { name: 'ZIP Files', extensions: ['zip'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });
                return result;
            } catch (error) {
                return handleError(error, 'select-export-path');
            }
        });

        // 删除应用
        this.handlers.set('remove-app', async (event, param) => {
            try {
                const { id, devTag } = param;
                if (!id) {
                    return handleError(new Error('应用 ID 不能为空'), 'remove-app');
                }

                const store = devTag ? getAppsDevStore() : getAppsStore();
                const appsData = store.get('default') || {};
                const appItem = appsData[id];

                if (!appItem) {
                    return handleError(new Error('应用不存在'), 'remove-app');
                }

                // 删除应用文件
                let appPath;
                if (devTag) {
                    // 开发环境：只从数据中移除，不删除用户的项目源代码目录
                    logger.info(`开发应用移除: ${id}, path: ${appItem.path}`);
                } else {
                    appPath = path.join(getAppPath(), `${id}.asar`);

                    // 使用 original-fs 删除 asar 文件
                    try {
                        originalFs.rmSync(appPath, { recursive: true, force: true });
                        logger.info(`应用文件已删除: ${appPath}`);
                    } catch (error) {
                        logger.warn(`删除应用文件失败: ${error}`);
                    }

                    // 删除 .asar.unpacked 目录
                    try {
                        const unpackedPath = path.join(getAppPath(), `${id}.asar.unpacked`);
                        originalFs.rmSync(unpackedPath, { recursive: true, force: true });
                        logger.info(`asar.unpacked 目录已删除: ${unpackedPath}`);
                    } catch (error) {
                        logger.warn(`删除 asar.unpacked 目录失败: ${error}`);
                    }

                    // 删除 logo 文件（文件名可能是 uuid.png, uuid.jpg 等）
                    try {
                        const appsData = store.get('default') || {};
                        const appItem = appsData[id];
                        if (appItem && appItem.logo) {
                            // 尝试删除常见的 logo 文件扩展名
                            const logoExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
                            for (const ext of logoExtensions) {
                                const logoPath = path.join(getAppPath(), `${id}${ext}`);
                                if (fs.existsSync(logoPath)) {
                                    originalFs.unlinkSync(logoPath);
                                    logger.info(`Logo 文件已删除: ${logoPath}`);
                                }
                            }
                        }
                    } catch (error) {
                        logger.warn(`删除 logo 文件失败: ${error}`);
                    }

                    // 删除快捷方式（仅生产环境应用）
                    try {
                        const result = deleteLaunchers({ [id]: appItem });
                        if (result.success) {
                            logger.info(`应用快捷方式已删除: ${id}`);
                        } else {
                            logger.warn(`删除应用快捷方式失败: ${id}, ${result.error}`);
                        }
                    } catch (error) {
                        logger.warn(`删除应用快捷方式异常: ${id}, ${error}`);
                    }

                    // 删除 WebApp 的 partition 目录
                    try {
                        const partitionPath = path.join(getUserDataPath(), 'Partitions', id);
                        if (fs.existsSync(partitionPath)) {
                            originalFs.rmSync(partitionPath, { recursive: true, force: true });
                            logger.info(`WebApp partition 目录已删除: ${partitionPath}`);
                        }
                    } catch (error) {
                        logger.warn(`删除 WebApp partition 目录失败: ${id}, ${error}`);
                    }

                    // 删除普通 APP 数据目录
                    try {
                        const appDataPath = path.join(getAppDataPath(), id);
                        if (fs.existsSync(appDataPath)) {
                            originalFs.rmSync(appDataPath, { recursive: true, force: true });
                            logger.info(`应用数据目录已删除: ${appDataPath}`);
                        }
                    } catch (error) {
                        logger.warn(`删除应用数据目录失败: ${id}, ${error}`);
                    }
                }

                // 清除该 APP 注册的全局快捷键
                try {
                    const GlobalShortcutManager = require('@modules/canbox/main/globalShortcutManager');
                    GlobalShortcutManager.getInstance().unregisterAllByAppId(id);
                } catch (error) {
                    logger.warn('清除全局快捷键失败: {}, {}', id, error);
                }

                // 从存储中删除
                delete appsData[id];
                store.set('default', appsData);

                // 同步更新仓库的下载状态（非开发应用才需要）
                if (!devTag) {
                    await syncReposDownloadStatus(id, false);
                }

                // 获取应用名称用于操作历史记录
                const appName = appItem?.appJson?.name || appItem?.name || id;
                const appDataPath = path.join(getAppDataPath(), id);
                const hasData = fs.existsSync(appDataPath);

                const actionKey = devTag ? 'appRemoved' : (hasData ? 'appDeletedWithData' : 'appDeleted');
                canboxDb.put({
                    type: 'info',
                    message: `operationHistory.messages.${actionKey}`,
                    params: { appName: appName },
                    module: 'app',
                    details: {
                        // appId: 应用唯一标识
                        appId: id,
                        // isDev: 是否为开发应用（true=移除，false=删除）
                        isDev: devTag,
                        // hasData: 删除前是否存在应用数据
                        hasData: hasData
                    }
                }, () => {});

                logger.info(`应用已删除: ${id}, devTag: ${devTag}`);
                return { success: true };
            } catch (error) {
                return handleError(error, 'remove-app');
            }
        });

        // 清除应用数据
        this.handlers.set('clearAppData', async (event, id) => {
            try {
                if (!id) {
                    return handleError(new Error('应用 ID 不能为空'), 'clearAppData');
                }

                // 获取应用配置
                const appsData = getAppsStore().get('default') || {};
                const appItem = appsData[id];
                const appName = appItem?.appJson?.name || appItem?.name || id;

                // 判断是否为 WebApp
                let isWebApp = false;
                try {
                    const appJsonPath = path.join(getAppPath(), id + '.asar/app.json');
                    const appJsonContent = fs.readFileSync(appJsonPath, 'utf8');
                    const appJson = JSON.parse(appJsonContent);
                    isWebApp = appJson.type === 'webapp';
                } catch (error) {
                    logger.warn(`无法读取应用 ${id} 的 app.json，假设为普通应用:`, error.message);
                }

                let clearedSize = 0;

                if (isWebApp) {
                    // WebApp：清除 session 存储数据
                    try {
                        const { session } = require('electron');
                        const part = session.fromPartition('persist:' + id);
                        await part.clearStorageData();
                        logger.info(`WebApp session 数据已清除: ${id}`);
                    } catch (error) {
                        logger.error(`清除 WebApp session 数据失败: ${id}`, error);
                        throw error;
                    }
                } else {
                    // 普通 APP：清除数据目录内容，保留目录本身
                    const appDataPath = path.join(getAppDataPath(), id);

                    // 计算要清理的数据大小
                    if (fs.existsSync(appDataPath)) {
                        clearedSize = getDirSize(appDataPath);
                        // 清空目录内容，保留目录本身
                        const entries = fs.readdirSync(appDataPath);
                        for (const entry of entries) {
                            const entryPath = path.join(appDataPath, entry);
                            originalFs.rmSync(entryPath, { recursive: true, force: true });
                        }
                        logger.info(`应用数据已清除: ${appDataPath}, size: ${clearedSize}`);
                    } else {
                        logger.info(`应用数据目录不存在: ${appDataPath}`);
                    }
                }

                // 清除窗口状态
                const winState = require('@modules/canbox/main/winState');
                winState.remove(id, (result) => {
                    if (result.success) {
                        logger.info(`应用窗口状态已清除: ${id}`);
                    }
                });

                // 写入操作历史
                canboxDb.put({
                    type: 'info',
                    message: 'operationHistory.messages.appDataClearedSize',
                    params: { appName: appName, size: formatSize(clearedSize) },
                    module: 'app',
                    details: {
                        // appId: 应用唯一标识
                        appId: id,
                        // clearedSize: 清理的数据大小（字节）
                        clearedSize: clearedSize,
                        // clearedSizeStr: 清理的数据大小（格式化字符串）
                        clearedSizeStr: clearedSize > 0 ? formatSize(clearedSize) : '0 B',
                        // isWebApp: 是否为 WebApp
                        isWebApp: isWebApp
                    }
                }, () => {});

                return { success: true };
            } catch (error) {
                return handleError(error, 'clearAppData');
            }
        });

        // 获取应用信息
        this.handlers.set('getAppInfo', async (event, uid) => {
            try {
                return getAppInfo(uid);
            } catch (error) {
                return handleError(error, 'getAppInfo');
            }
        });

        // 获取开发应用信息
        this.handlers.set('getAppDevInfo', async (event, uid) => {
            try {
                return getAppDevInfo(uid);
            } catch (error) {
                return handleError(error, 'getAppDevInfo');
            }
        });

        // 打开 APP 数据目录
        this.handlers.set('openAppDataDir', async (event, id) => {
            try {
                if (!id) {
                    return { success: false, msg: '应用 ID 不能为空' };
                }

                const appDataPath = path.join(getAppDataPath(), id);

                // 确保目录存在
                if (!fs.existsSync(appDataPath)) {
                    fs.mkdirSync(appDataPath, { recursive: true });
                    logger.info('APP data directory created: {}', appDataPath);
                }

                // 使用 shell.openPath 打开目录（跨平台）
                const errorMsg = await shell.openPath(appDataPath);
                if (errorMsg) {
                    logger.error('Failed to open APP data dir: {}, error: {}', appDataPath, errorMsg);
                    return { success: false, msg: errorMsg };
                }

                logger.info('Opened APP data directory: {}', appDataPath);
                return { success: true };
            } catch (error) {
                logger.error('Failed to open APP data dir for: {}, error:', id, error);
                return { success: false, msg: error.message };
            }
        });

        // 添加开发应用（选择 app.json）
        this.handlers.set('handle-app-dev-add', async () => {
            try {
                const { dialog } = require('electron');

                // 显示文件选择对话框
                const result = await dialog.showOpenDialog({
                    title: translate('devApp.addApp'),
                    properties: ['openFile'],
                    filters: [
                        { name: 'App JSON', extensions: ['json'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                if (result.canceled || result.filePaths.length === 0) {
                    logger.info('用户取消选择 app.json 文件');
                    return { correct: {} };
                }

                const selectedPath = result.filePaths[0];
                const appDir = path.dirname(selectedPath);
                const { v4: uuidv4 } = require('uuid');
                const uid = uuidv4().replace(/-/g, '');

                // 验证 app.json 文件
                try {
                    const appJsonContent = fs.readFileSync(selectedPath, 'utf8');
                    const appJson = JSON.parse(appJsonContent);

                    // 验证必需字段
                    if (!appJson.name || !appJson.version) {
                        return { correct: {}, wrong: { error: 'app.json 缺少必需字段 (name, version)' } };
                    }

                    // 保存到开发应用存储（只保存 path，appJson 由 get-apps-dev-data 动态读取）
                    let appDevInfoData = getAppsDevStore().get('default') || {};
                    appDevInfoData[uid] = {
                        path: appDir
                    };
                    getAppsDevStore().set('default', appDevInfoData);

                    logger.info(`开发应用添加成功: ${uid}, name: ${appJson.name}`);

                    // 返回包含 appJson 的数据用于前端立即显示
                    const appDevDataWithJson = {};
                    for (const [key, value] of Object.entries(appDevInfoData)) {
                        if (key === uid) {
                            appDevDataWithJson[key] = { ...value, appJson };
                        } else {
                            // 读取其他应用的 app.json
                            try {
                                const jsonPath = path.join(value.path, 'app.json');
                                const jsonContent = fs.readFileSync(jsonPath, 'utf8');
                                appDevDataWithJson[key] = { ...value, appJson: JSON.parse(jsonContent) };
                            } catch (e) {
                                appDevDataWithJson[key] = { ...value };
                            }
                        }
                    }
                    return { correct: appDevDataWithJson };
                } catch (error) {
                    logger.error(`解析 app.json 失败: ${selectedPath}`, error);
                    return { correct: {}, wrong: { error: error.message } };
                }
            } catch (error) {
                logger.error('添加开发应用失败:', error);
                return { correct: {}, wrong: { error: error.message } };
            }
        });
        // 抓取网站信息
        this.handlers.set('fetch-website-info', async (event, url) => {
            try {
                if (!url) {
                    return { success: false, error: 'URL is required' };
                }
                const info = await fetchWebsiteInfo(url);
                let iconPath = '';
                if (info.faviconUrl) {
                    const tmpDir = path.join(getAppPath(), 'tmp-webapp-icon');
                    if (!fs.existsSync(tmpDir)) {
                        fs.mkdirSync(tmpDir, { recursive: true });
                    }
                    const iconTmpPath = path.join(tmpDir, 'favicon-' + Date.now() + '.png');
                    const downloadResult = await downloadIcon(info.faviconUrl, iconTmpPath);
                    if (downloadResult.success) {
                        iconPath = downloadResult.path;
                    }
                }
                return {
                    success: true,
                    data: {
                        title: info.title,
                        url: info.url,
                        iconPath: iconPath
                    }
                };
            } catch (error) {
                logger.error('fetch-website-info failed: {}', error.message);
                return { success: false, error: error.message };
            }
        });

        // 创建网页应用
        this.handlers.set('create-web-app', async (event, options) => {
            try {
                const result = await createWebApp(options);
                if (result.success) {
                    canboxDb.put({
                        type: 'success',
                        message: 'operationHistory.messages.webAppCreated',
                        params: { appName: options.name },
                        module: 'app',
                        details: {
                            appId: result.uid,
                            url: options.url
                        }
                    }, () => {});
                }
                return result;
            } catch (error) {
                logger.error('create-web-app failed: {}', error.message);
                return { success: false, error: error.message };
            }
        });

        this.handlers.set('get-default-icon-path', async () => {
            const defaultIconPath = path.join(__dirname, '..', 'web-app', 'default-icon.png');
            if (fs.existsSync(defaultIconPath)) {
                return { success: true, path: defaultIconPath };
            }
            return { success: false };
        });
    }

    /**
     * 初始化 IPC 处理器
     * @param {Electron.IpcMain} ipcMain 
     */
    init(ipcMain) {
        for (const [channel, handler] of this.handlers) {
            ipcMain.handle(channel, handler);
            logger.info(`Registered IPC handler: ${channel}`);
        }

        // 注册 app-export 任务执行器
        const FileTaskManager = require('@modules/canbox/file-task/file-task-manager');
        const taskManager = FileTaskManager.getInstance();
        taskManager.registerExecutor('app-export', async (task) => {
            await handleAppExportTask(task);
        });
        
        // 注册 load-app 处理器（使用 ipcMain.on 因为前端使用 ipcRenderer.send）
        ipcMain.on('load-app', async (event, uid, devTag = false) => {
            try {
                const appLoader = require('@modules/canbox/main/appLoader');
                await appLoader.loadApp(uid, devTag);
                logger.info('App {} loaded successfully', uid);
            } catch (error) {
                logger.error('Failed to load app {}, error: {}', uid, error);
                event.reply('load-app-error', { uid, error: error.message });
            }
        });
        logger.info('Registered IPC handler: load-app');
    }
}

module.exports = new AppManagerIpcHandler();