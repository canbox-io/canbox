const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { dialog } = require('electron');
const { handleError } = require('@modules/ipc/errorHandler');
const logger = require('@modules/utils/logger');

const { getReposStore, getAppsStore } = require('@modules/main/storageManager');
const repoUtils = require('@modules/utils/repoUtils');
const fsUtils = require('@modules/utils/fs-utils');
const DateFormat = require('@modules/utils/DateFormat');
const canboxDb = require('@modules/core/canboxDb');
const i18nModule = require('../../locales');

const { handleImportApp } = require('@modules/main/appManager');
const FileTaskManager = require('@modules/file-task/file-task-manager');

const { getReposPath, getReposTempPath } = require('@modules/main/pathManager');
const REPOS_PATH = getReposPath();
const REPOS_TEMP_PATH = getReposTempPath();

async function updateReposStatus(uid) {
    const reposStore = getReposStore();
    const reposData = reposStore.get('default') || {};
    if (!reposData || Object.keys(reposData).length === 0) {
        return { success: true };
    }
    const repo = reposData[uid];
    if (!repo) {
        return { success: true };
    }

    // 下载状态置为false，并删除下载时间和可更新状态
    reposData[uid].downloaded = false;
    delete reposData[uid].downloadTime;
    delete reposData[uid].toUpdate;
    reposStore.set('default', reposData);
    return { success: true };
}

/**
 * 处理添加单个仓库的逻辑
 */
async function handleAddAppRepo(repoUrl) {
    try {
        if (!repoUrl) {
            throw new Error('NoGitRepo');
        }

        // 校验仓库地址格式
        if (!repoUtils.validateRepoUrl(repoUrl)) {
            throw new Error('InvalidGitRepo');
        }

        // 自动获取仓库的默认分支
        let branch = '';
        try {
            // 移除末尾的 .git 后缀（如果有）
            let cleanRepoUrl = repoUrl;
            if (cleanRepoUrl.endsWith('.git')) {
                cleanRepoUrl = cleanRepoUrl.slice(0, -4);
            }

            // 尝试获取仓库信息来推断默认分支
            const repoInfoUrl = cleanRepoUrl + '/info/refs?service=git-upload-pack';
            const response = await axios.get(repoInfoUrl, {
                timeout: 10000, // 10秒超时
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Canbox/0.1.0'
                }
            });
            const text = response.data;
            // 从响应中提取默认分支信息
            const match = text.match(/refs\/heads\/([^\s]+)/);
            if (match) {
                branch = match[1];
            } else {
                branch = 'main'; // 回退到 main
            }
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                logger.warn('获取默认分支超时，使用 main 作为默认分支');
            } else {
                logger.info('无法自动获取默认分支，使用 main 作为默认分支: {}', error.message);
            }
            branch = repoUrl.includes('github.com') ? 'main' : 'master'; // 回退到 main
        }

        // 尝试访问仓库地址
        try {
            const url = repoUtils.getFileUrl(repoUrl, branch, 'app.json');
            logger.info('验证仓库访问: {}', url);
            const response = await axios.get(url, {
                timeout: 10000, // 10秒超时
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Canbox/0.1.0'
                }
            });
            if (response.status !== 200) {
                logger.error('仓库访问失败，状态码: {} URL: {}', response.status, url);
                logger.error('响应内容(前500字符): {}', JSON.stringify(response.data).substring(0, 500));
                throw new Error('UnableToAccessRepo');
            }
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                logger.warn('仓库访问超时: {}', repoUrl);
                throw new Error('NetworkTimeout');
            } else if (error.response) {
                logger.error('仓库访问失败，状态码: {} URL: {}', error.response.status, url);
                logger.error('响应内容(前500字符): {}', JSON.stringify(error.response.data).substring(0, 500));
                throw new Error('UnableToAccessRepo');
            }
            throw error;
        }

        const uuid = uuidv4().replace(/-/g, '');
        const reposPath = path.join(REPOS_PATH, uuid);
        fs.mkdirSync(reposPath, { recursive: true });

        let appJson, logoPath;
        // 下载文件
        const filesToDownload = ['app.json', 'README.md', 'HISTORY.md'];
        for (const file of filesToDownload) {
            const fileUrl = repoUtils.getFileUrl(repoUrl, branch, file);
            const filePath = path.join(reposPath, file);
            const downloadSuccess = await repoUtils.downloadFileFromRepo(fileUrl, filePath);
            if (!downloadSuccess && file === 'app.json') {
                throw new Error('CannotDownloadAppJson');
            }

            // 如果是app.json，下载logo图片
            if (file === 'app.json' && downloadSuccess) {
                appJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (appJson.logo) {
                    const logoUrl = repoUtils.getFileUrl(repoUrl, branch, appJson.logo);
                    const logoExt = path.extname(appJson.logo);
                    logoPath = path.join(reposPath, `logo${logoExt}`);
                    const logoDir = path.dirname(logoPath);

                    fsUtils.ensureDirExists(logoDir);

                    // const logoDownloadSuccess = await repoUtils.downloadLogoFromRepo(logoUrl, logoPath);
                    // if (!logoDownloadSuccess) {
                    //     console.warn(`无法下载logo图片: ${logoUrl}`);
                    // }
                    repoUtils.downloadLogoFromRepo(logoUrl, logoPath).then((logoDownloadSuccess) => {
                        if (!logoDownloadSuccess) {
                            logger.warn(`无法下载logo图片 / Failed to download logo image: ${logoUrl}`);
                        }
                    });
                }
            }
        }

        // 保存仓库信息
        const reposStore = getReposStore();
        const reposData = reposStore.get('default') || {};
        reposData[uuid] = {
            id: appJson.id,
            name: appJson.name,
            repo: repoUrl,
            branch: branch,
            author: appJson.author || '',
            version: appJson.version || '',
            description: appJson.description || '',
            logo: logoPath,
            platform: appJson.platform || [],
            categories: appJson.categories || [],
            tags: appJson.tags || [],
            files: {},
            createTime: Date.now(),
            downloaded: false
        };

        // 异步计算并保存文件哈希值
        await Promise.all(filesToDownload.map(async (file) => {
            const filePath = path.join(reposPath, file);
            if (fs.existsSync(filePath)) {
                const crypto = require('crypto');
                const hash = crypto.createHash('sha256');
                const stream = fs.createReadStream(filePath);

                await new Promise((resolve, reject) => {
                    stream.on('data', (chunk) => hash.update(chunk));
                    stream.on('end', () => {
                        const fileHash = hash.digest('hex');
                        reposData[uuid].files[file.replace(/\./g, '_')] = fileHash;
                        resolve();
                    });
                    stream.on('error', reject);
                });
            }
        }));

        reposStore.set('default', reposData);
/*
{
    "default": {
        "3a6f487d7f9f4fae86dcfbc3dde401a2": {
            "id": "com.gitee.lizl6.cb-jsonbox",
            "name": "jsonbox",
            "repo": "https://gitee.com/rexlevin/cb-jsonbox",
            "branch": "master",
            "author": "lizl6",
            "version": "0.0.1",
            "description": "JsonBox - 跨平台的 JSON 格式化工具",
            "logo": "/home/lizl6/.config/canbox/Users/repos/3a6f487d7f9f4fae86dcfbc3dde401a2/logo.png"
        }
    }
}
        */

        // 对比"我的app"中已有的app，如果有相同id，则设置downloaded为true
        const appsStore = getAppsStore();
        const appsData = appsStore.get('default') || {};
        const isAppDownloaded = Object.values(appsData).some(app => app.id === appJson.id);

        if (isAppDownloaded) {
            const updatedReposData = reposStore.get('default') || {};
            updatedReposData[uuid].downloaded = true;
            updatedReposData[uuid].downloadTime = Date.now();
            reposStore.set('default', updatedReposData);
            logger.info(`仓库 ${uuid} (id: ${appJson.id}) 已下载，更新状态`);
        }

        return { success: true };
    } catch (error) {
        throw error;
    }
}

/**
 * 处理批量导入仓库列表的逻辑
 */
async function handleImportAppRepos() {
    const result = await dialog.showOpenDialog({
        title: '选择仓库列表文件',
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: true, msg: 'NoFileSelected' };
    }
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    let reposData;
    try {
        reposData = JSON.parse(content);
    } catch (error) {
        throw new Error('Invalid JSON format');
    }

    if (!Array.isArray(reposData)) {
        throw new Error('Invalid format: expected an array of repos');
    }

    // 获取已有的仓库列表，用于去重
    const reposStore = getReposStore();
    const existingRepos = reposStore.get('default') || {};
    const existingRepoUrls = Object.values(existingRepos).map(repo => repo.repo.toLowerCase());

    let successCount = 0, failedRepos = [], skippedCount = 0;
    for (const repo of reposData) {
        const repoUrl = repo.repo;
        if (!repoUrl || typeof repoUrl !== 'string') {
            logger.warn(`跳过无效的仓库数据 / Skip invalid repo data: %o`, repo);
            failedRepos.push({ repo: repo, error: 'Missing or invalid repo field' });
            continue;
        }

        // 检查是否已存在相同的仓库 URL
        if (existingRepoUrls.includes(repoUrl.toLowerCase())) {
            logger.info(`跳过已存在的仓库 / Skip existing repo: ${repoUrl}`);
            skippedCount++;
            continue;
        }

        logger.info(`正在处理仓库 / Processing repo: ${repoUrl}`);
        try {
            await handleAddAppRepo(repoUrl);
            successCount++;
            // 更新已存在仓库列表
            const updatedRepos = reposStore.get('default') || {};
            existingRepoUrls.push(...Object.values(updatedRepos).map(r => r.repo.toLowerCase()));
        } catch (error) {
            logger.error(`处理仓库 ${repoUrl} 失败 / Failed to process repo ${repoUrl}: {}`, error.message || error);
            failedRepos.push({ repoUrl, error });
        }
    }

    // 通知前端仓库数据已更新
    if (successCount > 0) {
        const windows = BrowserWindow.getAllWindows();
        logger.info('windows: {}', windows.length);
        if (windows.length > 0) {
            logger.info("windows[0]: {}", windows[0]);
            windows[0].webContents.send('repo-data-updated');
        }
    }

    return { success: true, data: { successCount, failedRepos, skippedCount} };
}

/**
 * 获取仓库列表
 */
async function getReposData() {
    try {
        const reposData = getReposStore().get('default') || {};
        return { success: true, data: reposData };
    } catch (error) {
        return handleError(error, 'getReposData');
    }
}

/**
 * 获取仓库信息（README 和 HISTORY）
 */
async function getRepoInfo(uid) {
    try {
        const repoData = getReposStore().get('default');
        if (!repoData || !repoData[uid]) {
            return handleError(new Error('仓库不存在'), 'getRepoInfo');
        }

        const repoPath = path.join(REPOS_PATH, uid);
        const readFileWithErrorHandling = (filePath) => {
            try {
                if (fs.existsSync(filePath)) {
                    return fs.readFileSync(filePath, 'utf8');
                }
                return null;
            } catch (err) {
                logger.error(`文件操作失败 / File operation failed: ${err.path}`, err.message || err);
                return null;
            }
        };

        const readme = readFileWithErrorHandling(path.join(repoPath, 'README.md'));
        const history = readFileWithErrorHandling(path.join(repoPath, 'HISTORY.md'));

        const msg = (readme || history) ? null : '部分文件读取失败';
        return { success: null === msg, data: { readme, history }, msg };
    } catch (error) {
        return handleError(error, 'getRepoInfo');
    }
}

/**
 * 导出仓库列表为 JSON 文件
 */
async function exportReposData() {
    try {
        const reposData = getReposStore().get('default') || {};
        const exportData = [];

        // 提取需要的字段：id, name, repo, branch
        Object.entries(reposData).forEach(([uid, repo]) => {
            exportData.push({
                id: repo.id,
                name: repo.name,
                repo: repo.repo
            });
        });

        // 选择保存路径
        const result = await dialog.showSaveDialog({
            title: '导出 APP 源列表',
            defaultPath: 'app-repos.json',
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: true, msg: '已取消导出' };
        }

        // 写入文件
        fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');
        logger.info('导出仓库列表成功，文件路径: {}', result.filePath);

        return { success: true, data: { filePath: result.filePath } };
    } catch (error) {
        return handleError(error, 'exportReposData');
    }
}

/**
 * 删除仓库
 */
async function removeRepo(uid) {
    try {
        const reposStore = getReposStore();
        const reposData = reposStore.get('default') || {};
        if (!reposData[uid]) {
            return handleError(new Error('仓库不存在'), 'removeRepo');
        }
        delete reposData[uid];
        reposStore.set('default', reposData);
        // 删除仓库目录
        const repoPath = path.join(REPOS_PATH, uid);
        fs.rmdirSync(repoPath, { recursive: true });
        return { success: true };
    } catch (error) {
        return handleError(error, 'removeRepo');
    }
}

/**
 * 处理仓库下载任务
 * @param {Object} task - 任务对象
 */
async function handleRepoDownloadTask(task) {
    logger.info(`[Download] handleRepoDownloadTask 被调用, task.id=${task.id}, task.uid=${task.uid}`);
    
    const taskManager = FileTaskManager.getInstance();
    const { uid } = task;
    logger.info(`[Download] 获取到 uid: ${uid}`);

    const repoInfo = (getReposStore().get('default') || {})[uid];
    if (!repoInfo) {
        throw new Error('仓库不存在 / Repository not found');
    }

    const { repo, id, version } = repoInfo;
    const fileName = `${id}-${version}.zip`;

    // 构建下载 URL
    const downloadUrl = repoUtils.getDownloadUrl(repo, version, fileName);
    logger.info(`从 ${repo} 下载 ${fileName}... ${downloadUrl}`);

    // 文件路径（声明在函数作用域，以便在 catch 块中访问）
    let zipPath = null;

    logger.info(`[Download] 准备进入 try 块`);

    try {
        logger.info(`[Download] 进入 try 块，开始执行下载`);
        taskManager.updateProgress(task.id, 0, `开始下载 ${fileName}...`, 0);

        logger.info(`[Download] Step 1: 开始 axios 请求, url: ${downloadUrl}`);

        // 1. 下载文件到任务临时目录
        const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 15000, // 15秒超时
        });

        logger.info(`[Download] Step 2: axios 请求返回, status: ${response.status}`);

        // 检查 HTTP 响应状态
        if (response.status !== 200) {
            throw new Error(`下载失败，HTTP 状态码: ${response.status}`);
        }

        zipPath = path.join(task.tempPath, fileName);
        logger.info(`[Download] Step 3: 准备写入文件: ${zipPath}`);

        // 确保目录存在
        const tempDir = path.dirname(zipPath);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // 使用更简单的流处理方式
        const writer = fs.createWriteStream(zipPath);
        
        logger.info(`[Download] Step 4: 开始写入流`);
        
        await new Promise((resolve, reject) => {
            response.data.on('end', () => {
                logger.info(`[Download] Step 5: 流结束事件`);
                resolve();
            });
            response.data.on('error', (err) => {
                logger.error(`[Download] 流错误: ${err.message}`);
                reject(err);
            });
            writer.on('error', (err) => {
                logger.error(`[Download] 写入错误: ${err.message}`);
                reject(err);
            });
            response.data.pipe(writer);
        });

        logger.info(`[Download] Step 6: 文件写入完成: ${zipPath}`);

        // 验证文件是否存在
        if (!fs.existsSync(zipPath)) {
            throw new Error(`下载的文件不存在: ${zipPath}`);
        }
        const stats = fs.statSync(zipPath);
        logger.info(`[Download] 文件大小: ${stats.size} bytes`);

        if (stats.size === 0) {
            throw new Error('下载的文件大小为 0');
        }

        taskManager.updateProgress(task.id, 50, '下载完成，开始导入...', 0);

        // 2. 导入应用（直接调用 importAppFromZip，不创建新任务）
        const { importAppFromZip } = require('@modules/main/appManager');
        const ret = await importAppFromZip(task, zipPath, uid);
        if (!ret.success) {
            throw new Error(ret.msg || '导入失败 / Import failed');
        }

        taskManager.updateProgress(task.id, 90, '导入完成，更新状态...', 0);

        // 3. 更新仓库下载状态
        const reposStore = getReposStore();
        const reposData = reposStore.get('default') || {};
        reposData[uid] = { ...repoInfo, downloaded: true, downloadTime: DateFormat.format(new Date()), toUpdate: false };
        reposStore.set('default', reposData);

        // 4. 写入操作历史
        const appName = repoInfo?.name || uid;
        const version = repoInfo?.version || 'unknown';
        canboxDb.put({
            type: 'success',
            message: 'operationHistory.messages.appDownloadSuccess',
            params: { appName: appName, version: version },
            module: 'repo',
            details: {
                // appId: 应用唯一标识
                appId: uid,
                // version: 应用版本号
                version: version,
                // repoUrl: 来源仓库地址
                repoUrl: repoInfo?.url || ''
            }
        }, () => {});

        taskManager.updateProgress(task.id, 100, '已完成 / Completed', 0);

    } catch (error) {
        logger.error(`[Download] 进入 catch 块, 错误: ${error.message}`);
        // 清理临时文件
        if (zipPath && fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
        // 超时错误转换为友好提示
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            throw new Error('网络连接超时，目标链接暂时无法访问，请检查网络');
        }
        throw error;
    }
}

/**
 * 从仓库下载应用（创建任务）
 */
async function downloadAppsFromRepo(uid) {
    const taskManager = FileTaskManager.getInstance();
    const task = await taskManager.createTask('repo-download', uid);
    return { success: true, taskId: task.id };
}

/**
 * 初始化仓库管理相关的 IPC 处理逻辑
 */
function initRepoHandlers() {
    // 注册 repo-download 执行器
    const taskManager = FileTaskManager.getInstance();
    taskManager.registerExecutor('repo-download', async (task) => {
        await handleRepoDownloadTask(task);
    });

    // 添加app源
    ipcMain.handle('add-app-repo', async (event, repoUrl) => {
        try {
            return handleAddAppRepo(repoUrl);
        } catch (error) {
            return handleError(error, 'add-app-repo');
        }
    });

    // 导入app源列表
    ipcMain.handle('import-app-repos', async () => {
        try {
            return handleImportAppRepos();
        } catch (error) {
            return handleError(error, 'import-app-repos');
        }
    });

    // 获取仓库列表
    ipcMain.handle('get-repos-data', async () => {
        return getReposData();
    });

    // 获取仓库信息（README 和 HISTORY）
    ipcMain.handle('getRepoInfo', async (event, uid) => {
        return getRepoInfo(uid);
    });

    // 删除仓库
    ipcMain.handle('remove-repo', async (event, uid) => {
        return removeRepo(uid);
    });

    // 从仓库下载应用
    ipcMain.handle('download-apps-from-repo', async (event, uid) => {
        return downloadAppsFromRepo(uid);
    });

    ipcMain.handle('update-repos-status', async (event, uid) => {
        return updateReposStatus(uid);
    });

    // 导出仓库列表
    ipcMain.handle('export-repos-data', async () => {
        return exportReposData();
    });
}

/**
 * 根据 APP ID 更新所有相关仓库的下载状态
 * @param {string} appId - APP 的 id
 * @param {boolean} downloaded - 下载状态
 * @returns {Promise<{success: boolean, updated: boolean}>}
 */
async function syncReposDownloadStatus(appId, downloaded) {
    const reposStore = getReposStore();
    const reposData = reposStore.get('default') || {};
    let updated = false;

    for (const [uid, repo] of Object.entries(reposData)) {
        if (repo.id === appId) {
            reposData[uid].downloaded = downloaded;
            if (!downloaded) {
                delete reposData[uid].toUpdate;
                delete reposData[uid].downloadTime;
            }
            updated = true;
            logger.info(`同步仓库 ${uid} 的 downloaded 状态为 ${downloaded}`);
        }
    }

    if (updated) {
        reposStore.set('default', reposData);
    }
    return { success: true, updated };
}

module.exports = {
    init: initRepoHandlers,
    syncReposDownloadStatus
};