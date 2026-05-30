const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs'); // 使用 original-fs 来操作 asar 文件
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { getAppsStore, getAppsDevStore } = require('@modules/main/storageManager');
const { getAppPath, getAppTempPath, getAppIconPath } = require('@modules/main/pathManager');
const { handleError } = require('@modules/ipc/errorHandler')
const DateFormat = require('@modules/utils/DateFormat');
const logger = require('@modules/utils/logger');
const fsUtils = require('@modules/utils/fs-utils');
const FileTaskManager = require('@modules/file-task/file-task-manager');

// 注册 app-import 执行器
FileTaskManager.getInstance().registerExecutor('app-import', async (task) => {
    await handleAppImportTask(task);
});

// 延迟加载 sharp 的缓存，只在需要时动态加载（仅 Windows）
let sharpCache = null;

/**
 * 动态加载 sharp 模块
 * @returns {sharp|null} sharp 实例或 null
 */
function getSharp() {
    if (process.platform !== 'win32') {
        return null;
    }

    if (sharpCache === null) {
        try {
            // 使用动态 require，避免在非 Windows 平台加载
            const sharpModule = require('sharp');
            sharpCache = sharpModule;
        } catch (error) {
            logger.warn('sharp 模块加载失败，图标转换功能将不可用 / Sharp module load failed, icon conversion unavailable: {}', error.message);
            sharpCache = false; // 标记为已尝试加载但失败
        }
    }

    return sharpCache || null;
}

/**
 * 将 PNG/JPEG 图片转换为 ICO 格式
 * @param {string} inputPath - 输入图片路径
 * @param {string} outputPath - 输出 ICO 路径
 */
async function convertToIco(inputPath, outputPath) {
    const sharp = getSharp();
    if (!sharp) {
        logger.warn('sharp 模块未加载，跳过图标转换 / Sharp module not loaded, skip icon conversion');
        return false;
    }

    try {
        // 先转换为 256x256 的 PNG
        const tempPngPath = outputPath.replace('.ico', '.temp.png');
        await sharp(inputPath)
            .resize(256, 256, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toFile(tempPngPath);

        // 创建简单的 ICO 文件
        await createSimpleIco(tempPngPath, outputPath);

        // 删除临时文件
        if (fs.existsSync(tempPngPath)) {
            fs.unlinkSync(tempPngPath);
        }

        logger.debug(`成功转换图标 / Icon conversion successful: ${inputPath} -> ${outputPath}`);
        return true;
    } catch (error) {
        logger.error('转换图标失败 / Icon conversion failed: {}', error.message || error);
        // 清理临时文件
        const tempPngPath = outputPath.replace('.ico', '.temp.png');
        if (fs.existsSync(tempPngPath)) {
            try {
                fs.unlinkSync(tempPngPath);
            } catch (cleanupError) {
                logger.error('清理临时文件失败 / Failed to cleanup temp file: {}', cleanupError.message || cleanupError);
            }
        }
        return false;
    }
}

/**
 * 使用 PNG 文件创建简单的 ICO 文件
 * @param {string} pngPath - 输入 PNG 路径
 * @param {string} outputPath - 输出 ICO 路径
 */
async function createSimpleIco(pngPath, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            // 读取 PNG 文件
            const pngData = fs.readFileSync(pngPath);

            // ICO 文件头 (6 bytes)
            const header = Buffer.alloc(6);
            header.writeUInt16LE(0, 0);     // 保留字段
            header.writeUInt16LE(1, 2);     // 图像类型 (1 = ICO)
            header.writeUInt16LE(1, 4);     // 图像数量 (1)

            // ICO 目录条目 (16 bytes)
            const dirEntry = Buffer.alloc(16);
            const width = 256;
            const height = 256;
            dirEntry.writeUInt8(width >= 256 ? 0 : width, 0);   // 宽度 (0 表示 256)
            dirEntry.writeUInt8(height >= 256 ? 0 : height, 1);  // 高度 (0 表示 256)
            dirEntry.writeUInt8(0, 2);                          // 颜色数 (0 = >=8bpp)
            dirEntry.writeUInt8(0, 3);                          // 保留字段
            dirEntry.writeUInt16LE(1, 4);                       // 颜色平面
            dirEntry.writeUInt16LE(32, 6);                      // 每像素位数 (32 = RGBA)
            dirEntry.writeUInt32LE(pngData.length, 8);          // 图像数据大小
            dirEntry.writeUInt32LE(22, 12);                     // 图像数据偏移量 (6 + 16)

            // 组合所有数据
            const icoData = Buffer.concat([header, dirEntry, pngData]);
            fs.writeFileSync(outputPath, icoData);

            logger.debug(`ICO文件创建成功 / ICO file created: ${outputPath} (${pngData.length} bytes)`);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 获取所有应用数据
 * @returns {Object} 应用数据
 */
function getAllApps() {
    try {
        const appsData = getAppsStore().get('default') || {};
        if (!appsData || Object.keys(appsData).length === 0) {
            logger.info('当前没有应用数据 / No application data available');
            return { success: true, data: {}};
        }
        Object.entries(appsData).forEach(([uid, appItem]) => {
            const asarPath = path.join(getAppPath(), uid + '.asar');
            let appJson;
            try {
                let appJsonContent;
                appJsonContent = fs.readFileSync(path.join(asarPath, 'app.json'), 'utf8');
                appJson = JSON.parse(appJsonContent);
            } catch (error) {
                logger.error(`读取 ${uid}.asar/app.json 失败 / Failed to read ${uid}.asar/app.json: {}`, error.message || error);
                return;
            }
            const iconPath = path.join(getAppPath(), uid + '.asar', appJson.logo);
            const appJsonData = {...appJson, logo: iconPath };
            appItem.appJson = appJsonData;
        });
        return { success: true, data: appsData };
    } catch (err) {
        return handleError(err, 'getAllApps');
    }
}

/**
 * 获取应用信息
 */
function getAppInfo(uid) {
    logger.debug('getAppInfo uid: {}', uid);
    if (!uid) {
        return handleError(new Error('uid 不能为空'), 'getAppInfo');
    }
    // 判断是否为开发中的应用
    const devFlag = JSON.stringify(getAppsStore().get('default')[uid] || {}) === '{}';
    const appItem = getAppsStore().get('default')[uid] || getAppsDevStore().get('default')[uid];
    const appPath = devFlag ? appItem.path : path.join(getAppPath(), uid + '.asar');

    // const appItemJsonStr = fs.readFileSync(path.join(appPath, 'app.json'), 'utf8');
    // const appItem = JSON.parse(appItemJsonStr);
    const readFileWithErrorHandling = (filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf8');
            }
            return null;
        } catch (err) {
            logger.error(`文件操作失败 / File operation failed: ${err.path}: {}`, err.message || err);
            return null;
        }
    };

    const [readme, history] = [
        readFileWithErrorHandling(path.join(appPath, 'README.md')),
        readFileWithErrorHandling(path.join(appPath, 'HISTORY.md'))
    ];

    let isWebApp = false;
    try {
        const appJsonContent = fs.readFileSync(path.join(appPath, 'app.json'), 'utf8');
        const appJson = JSON.parse(appJsonContent);
        isWebApp = appJson.type === 'webapp';
    } catch (e) { /* ignore */ }

    const msg = (readme || history || isWebApp) ? null : '部分文件读取失败';
    return { success: null === msg, data: { readme, history }, msg };
}

/**
 * 获取开发应用信息（仅用于开发应用）
 */
function getAppDevInfo(uid) {
    logger.debug('getAppDevInfo uid: {}', uid);
    if (!uid) {
        return handleError(new Error('uid 不能为空'), 'getAppDevInfo');
    }

    const appDevStore = getAppsDevStore().get('default');
    const appItem = appDevStore && appDevStore[uid];

    if (!appItem) {
        return handleError(new Error('开发应用不存在'), 'getAppDevInfo');
    }

    const appPath = appItem.path;

    const readFileWithErrorHandling = (filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf8');
            }
            return null;
        } catch (err) {
            logger.error(`文件操作失败 / File operation failed: ${err.path}: {}`, err.message || err);
            return null;
        }
    };

    const readme = readFileWithErrorHandling(path.join(appPath, 'README.md'));
    const history = readFileWithErrorHandling(path.join(appPath, 'HISTORY.md'));

    const msg = (readme || history) ? null : '部分文件读取失败';
    return { success: null === msg, data: { readme, history }, msg };
}

/**
 * 底层导入逻辑（可从多个任务中调用）
 * @param {Object} task - 任务对象
 * @param {string} zipPath - zip 文件路径
 * @param {string} uid - 应用 UID
 * @returns {Promise<{success: boolean}>}
 */
async function importAppFromZip(task, zipPath, uid) {
    const taskManager = FileTaskManager.getInstance();

    logger.info('{} importAppFromZip: {}', uid, zipPath);

    try {
        taskManager.updateProgress(task.id, 10, '开始导入...', 0);

        // 将文件复制到 task.tempPath 目录下
        const targetPath = path.join(task.tempPath, `${uid}.zip`);
        fs.copyFileSync(zipPath, targetPath);

        taskManager.updateProgress(task.id, 20, '文件复制成功，开始解压...', 0);

        // 解压
        if (process.platform === 'win32') {
            execSync(`powershell -Command "Expand-Archive -Path '${targetPath}' -DestinationPath '${task.tempPath}'"`, { stdio: 'inherit' });
        } else {
            execSync(`unzip -o "${targetPath}" -d "${task.tempPath}"`, { stdio: 'inherit' });
        }

        taskManager.updateProgress(task.id, 40, '解压成功，处理文件...', 0);

        // 删除 zip 文件
        fs.rmSync(targetPath, { recursive: true, force: true });

        // 重命名文件
        const files = fs.readdirSync(task.tempPath);
        files.forEach(file => {
            if (file.endsWith('.asar')) {
                fs.renameSync(path.join(task.tempPath, file), path.join(task.tempPath, `${uid}.asar`));
            } else if (file.endsWith('.asar.unpacked')) {
                fs.renameSync(path.join(task.tempPath, file), path.join(task.tempPath, `${uid}.asar.unpacked`));
            }
        });

        taskManager.updateProgress(task.id, 60, '文件处理完成，读取配置...', 0);

        // 从临时目录的 asar 文件中读取 app.json
        // 注意：必须使用 fs（Electron 修补版）而不是 originalFs（原始版不支持 asar）
        const asarInTemp = path.join(task.tempPath, `${uid}.asar`);
        const appJsonPath = path.join(asarInTemp, 'app.json');
        logger.info('从临时目录读取 app.json: {}', appJsonPath);
        const appJsonContent = fs.readFileSync(appJsonPath, 'utf8');
        const appJson = JSON.parse(appJsonContent);
        logger.info('app.json 读取成功: {}', JSON.stringify(appJson));

        taskManager.updateProgress(task.id, 70, '配置读取完成，移动到目标目录...', 0);

        // 移动到目标目录
        const targetAppPath = getAppPath();
        logger.info('目标应用路径: {}', targetAppPath);
        if (!fs.existsSync(targetAppPath)) {
            fs.mkdirSync(targetAppPath, { recursive: true });
            logger.info('创建目标应用路径成功');
        }

        const filesToMove = fs.readdirSync(task.tempPath);
        logger.info('临时目录中的文件: {}', filesToMove);
        filesToMove.forEach(file => {
            // 跳过 .zip 文件，只移动 asar 相关文件
            if (file.endsWith('.zip')) {
                logger.info('跳过 zip 文件: {}', file);
                return;
            }
            const srcPath = path.join(task.tempPath, file);
            const destPath = path.join(targetAppPath, file);
            logger.info('移动文件: {} -> {}', srcPath, destPath);
            // 使用 originalFs.renameSync 直接移动（避免 Electron fs 的 asar 特殊处理）
            if (originalFs.existsSync(destPath)) {
                originalFs.rmSync(destPath, { recursive: true, force: true });
            }
            originalFs.renameSync(srcPath, destPath);
            logger.info('移动文件成功');
        });

        taskManager.updateProgress(task.id, 80, '移动完成，保存配置...', 0);

        // 保存到 store
        let appsConfig = getAppsStore().get('default') || {};
        appsConfig[uid] = {
            id: appJson.id || '',
            name: appJson.name || '',
            version: appJson.version || '',
            description: appJson.description || '',
            author: appJson.author || '',
            logo: appJson.logo || ''
        };
        if (task.options.importTag) {
            appsConfig[uid].sourceTag = 'import';
            appsConfig[uid].importTime = DateFormat.format(new Date());
        }
        getAppsStore().set('default', appsConfig);

        taskManager.updateProgress(task.id, 90, '配置保存完成，复制 logo...', 0);

        // 复制 logo（从目标路径的 asar 文件中读取）
        // 使用 fs.readFileSync + fs.writeFileSync 而不是 fs.copyFileSync（后者对 asar 内文件支持不好）
        const asarTargetPath = path.join(targetAppPath, `${uid}.asar`);
        const logoPathInAsar = path.join(asarTargetPath, appJson.logo);
        const logoExt = path.extname(appJson.logo).toLowerCase();
        const logoPathInTarget = path.join(getAppPath(), `${uid}${logoExt}`);

        try {
            logger.info('复制 logo: {} -> {}', logoPathInAsar, logoPathInTarget);
            // 使用 readFileSync + writeFileSync 从 asar 内复制文件
            const logoData = fs.readFileSync(logoPathInAsar);
            fs.writeFileSync(logoPathInTarget, logoData);
            logger.info('复制 logo 成功');

            // Windows 下生成 ICO 格式的图标
            if (process.platform === 'win32' && (logoExt === '.png' || logoExt === '.jpg' || logoExt === '.jpeg')) {
                const icoPath = path.join(getAppPath(), `${uid}.ico`);
                await convertToIco(logoPathInTarget, icoPath);
            }
        } catch (err) {
            logger.error('复制logo文件失败 / Failed to copy logo file: {}', err.message || err);
        }

        taskManager.updateProgress(task.id, 100, '导入完成 / Import completed', 0);

        return { success: true, uuid: uid };

    } catch (error) {
        logger.error('导入应用失败 / Failed to import app: {}', error.message || error);
        throw error;
    }
}

/**
 * 处理 app-import 任务（调用底层导入逻辑）
 * @param {Object} task - 任务对象
 */
async function handleAppImportTask(task) {
    const { source: zipPath, uid: inputUid, importTag } = task.options;
    const uid = inputUid || uuidv4().replace(/-/g, '');
    
    // 调用底层导入逻辑
    return await importAppFromZip(task, zipPath, uid);
}

/**
 * 导入应用（创建任务或执行导入）
 * @param {*} event
 * @param {string} zipPath - zip 文件路径
 * @param {string} uid - 应用 UID（可选，不提供则自动生成）
 * @param {Object} options - 选项
 * @param {boolean} options.skipTaskCreation - 是否跳过任务创建（从其他任务中调用时使用）
 * @returns
 */
async function handleImportApp(event, zipPath, uid, options = {}) {
    // 如果从其他任务中调用，直接执行导入逻辑，不创建新任务
    if (options.skipTaskCreation) {
        const task = options.task; // 当前任务对象
        return await handleAppImportTask(task);
    }

    // 否则创建新任务
    const taskManager = FileTaskManager.getInstance();
    const task = await taskManager.createTask('app-import', uid || uuidv4().replace(/-/g, ''), { source: zipPath });
    return { success: true, taskId: task.id };
}

module.exports = {
    getAllApps,
    getAppInfo,
    getAppDevInfo,
    handleImportApp,
    handleAppImportTask,
    importAppFromZip
}