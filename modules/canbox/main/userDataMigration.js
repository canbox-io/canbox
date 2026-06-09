const fs = require('fs-extra');
const originalFs = require('original-fs');
const path = require('path');
const { app, dialog } = require('electron');
const { getSystemConfigStore } = require('./storageManager');
const logger = require('@modules/utils/logger');

/**
 * 判断是否需要使用 original-fs
 * @param {string} filePath
 * @returns {boolean}
 */
function shouldUseOriginalFs(filePath) {
    return filePath.includes('.asar') ||
           filePath.includes('node_modules.asar');
}

/**
 * 格式化字节大小
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 从备份目录名提取时间戳
 * @param {string} backupName - 备份目录名
 * @returns {number|null} 时间戳（毫秒）
 */
function extractTimestamp(backupName) {
    const match = backupName.match(/^Users\.backup\.(\d{14})$/);
    if (!match) return null;

    try {
        const year = match[1].slice(0, 4);
        const month = match[1].slice(4, 6);
        const day = match[1].slice(6, 8);
        const hour = match[1].slice(8, 10);
        const minute = match[1].slice(10, 12);
        const second = match[1].slice(12, 14);

        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();
    } catch {
        return null;
    }
}

/**
 * 安全删除目录（逐个删除内容，支持 asar）
 * @param {string} dirPath
 * @param {number} retries
 * @returns {Promise<void>}
 */
async function safeRemoveDirectory(dirPath, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            if (!(await fs.pathExists(dirPath))) {
                logger.info('Directory does not exist, skipping: {}', dirPath);
                return;
            }

            logger.info('Removing directory (attempt {}/{}): {}', i + 1, retries, dirPath);
            await removeDirectoryRecursive(dirPath);
            logger.info('Successfully removed directory: {}', dirPath);
            return;
        } catch (error) {
            logger.error('Failed to remove directory (attempt {}/{}): {} - {}', i + 1, retries, dirPath, error.message);

            if (i < retries - 1) {
                // 等待一段时间后重试
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            } else {
                throw error;
            }
        }
    }
}

/**
 * 递归删除目录（支持 asar 文件）
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
async function removeDirectoryRecursive(dirPath) {
    if (!(await fs.pathExists(dirPath))) {
        logger.info('Directory does not exist, skipping: {}', dirPath);
        return;
    }

    logger.info('Removing directory recursively: {}', dirPath);

    // 读取目录内容
    let entries;
    try {
        if (shouldUseOriginalFs(dirPath)) {
            entries = await originalFs.promises.readdir(dirPath, { withFileTypes: true });
        } else {
            entries = await fs.readdir(dirPath, { withFileTypes: true });
        }
    } catch (readdirError) {
        // 如果无法读取目录，尝试直接删除
        logger.warn('Failed to read directory {}, trying direct removal: {}', dirPath, readdirError.message);
        await fs.remove(dirPath);
        return;
    }

    logger.info('Found {} entries in {}', entries.length, dirPath);

    if (entries.length === 0) {
        // 空目录直接删除
        await fs.rmdir(dirPath);
        logger.info('Removed empty directory: {}', dirPath);
        return;
    }

    // 递归删除每个条目
    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        logger.info('Removing entry: {}', entryPath);

        if (entry.isDirectory()) {
            await removeDirectoryRecursive(entryPath);
        } else {
            await removeFileWithRetry(entryPath);
            logger.info('Removed file: {}', entryPath);
        }
    }

    // 删除空目录
    try {
        await fs.rmdir(dirPath);
        logger.info('Removed directory after clearing contents: {}', dirPath);
    } catch (error) {
        // 如果删除失败，可能是还有隐藏文件或权限问题
        logger.warn('Failed to remove directory {}, will retry with fs.remove: {}', dirPath, error.message);
        await fs.remove(dirPath);
    }
}

/**
 * 删除文件（带重试，支持 asar）
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function removeFileWithRetry(filePath, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            if (shouldUseOriginalFs(filePath)) {
                await originalFs.promises.unlink(filePath);
            } else {
                await fs.unlink(filePath);
            }
            logger.info('Successfully removed file: {}', filePath);
            return;
        } catch (error) {
            logger.warn('Failed to remove file {} (attempt {}/{}): {}', filePath, i + 1, retries, error.message);
            if (i === retries - 1) {
                throw error;
            }
            // 增加重试间隔
            await new Promise(resolve => setTimeout(resolve, 200 * (i + 1)));
        }
    }
}

/**
 * 复制文件（支持 asar）
 * @param {string} src
 * @param {string} dest
 * @returns {Promise<void>}
 */
async function copyFileWithAsarSupport(src, dest) {
    try {
        if (shouldUseOriginalFs(src)) {
            // 使用 original-fs 处理 asar 文件，使用流式复制避免内存问题
            await new Promise((resolve, reject) => {
                const readStream = originalFs.createReadStream(src);
                const writeStream = originalFs.createWriteStream(dest);

                readStream.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);

                readStream.pipe(writeStream);
            });
        } else {
            await fs.copy(src, dest);
        }
        logger.info('Copied file: {} -> {}', src, dest);
    } catch (error) {
        logger.error('Failed to copy file {} -> {}: {}', src, dest, error);
        throw error;
    }
}

/**
 * 复制目录（递归，支持 asar）
 * @param {string} src
 * @param {string} dest
 * @returns {Promise<void>}
 */
async function copyDirectoryWithAsarSupport(src, dest) {
    await fs.ensureDir(dest);

    // 对于 asar 文件内的路径使用 original-fs，否则使用普通的 fs
    let entries;
    if (shouldUseOriginalFs(src)) {
        entries = await originalFs.promises.readdir(src, {
            withFileTypes: true
        });
    } else {
        entries = await fs.readdir(src, {
            withFileTypes: true
        });
    }

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        logger.info('Copying {} -> {}', srcPath, destPath);

        if (entry.isDirectory()) {
            await copyDirectoryWithAsarSupport(srcPath, destPath);
        } else {
            await copyFileWithAsarSupport(srcPath, destPath);
        }
    }
}

/**
 * 计算目录大小（字节）
 * @param {string} dirPath
 * @returns {Promise<number>}
 */
async function getDirectorySizeInBytes(dirPath) {
    let totalSize = 0;

    if (!(await fs.pathExists(dirPath))) {
        return 0;
    }

    async function calculateSize(dir) {
        const files = await fs.readdir(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);

            // 检查是否是 asar 文件，如果是则使用 original-fs
            const useOriginalFs = shouldUseOriginalFs(filePath);
            let stats;

            try {
                if (useOriginalFs) {
                    stats = await originalFs.promises.stat(filePath);
                } else {
                    stats = await fs.stat(filePath);
                }
            } catch (statError) {
                logger.warn('Failed to stat {}, skipping: {}', filePath, statError.message);
                continue;
            }

            if (stats.isDirectory()) {
                await calculateSize(filePath);
            } else {
                totalSize += stats.size;
            }
        }
    }

    await calculateSize(dirPath);
    logger.info('Directory size for {}: {}', dirPath, formatBytes(totalSize));
    return totalSize;
}

/**
 * 获取目录大小（格式化字符串）
 * @param {string} dirPath
 * @returns {Promise<string>}
 */
async function getDirectorySize(dirPath) {
    const bytes = await getDirectorySizeInBytes(dirPath);
    return formatBytes(bytes);
}

/**
 * 创建备份目录
 * @param {string} sourcePath - 源路径
 * @returns {Promise<string>} 备份目录路径
 */
async function createBackup(sourcePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 14);
    const backupPath = path.join(path.dirname(sourcePath), `Users.backup.${timestamp}`);

    logger.info('Creating backup from {} to {}', sourcePath, backupPath);

    try {
        // 检查源路径是否存在
        if (!(await fs.pathExists(sourcePath))) {
            logger.info('Source path does not exist, skipping backup: {}', sourcePath);
            return null; // 返回 null 表示没有创建备份
        }

        // 检查磁盘空间
        const sourceSize = await getDirectorySizeInBytes(sourcePath);
        const { free } = await fs.statfs(path.dirname(sourcePath));

        if (sourceSize * 1.2 > free) { // 需要 20% 的额外空间
            throw new Error(`Insufficient disk space for backup. Required: ${formatBytes(sourceSize * 1.2)}, Available: ${formatBytes(free)}`);
        }

        // 复制目录到备份位置（使用支持 asar 的复制函数）
        await copyDirectoryWithAsarSupport(sourcePath, backupPath);

        logger.info('Backup created successfully: {}', backupPath);
        return backupPath;
    } catch (error) {
        logger.error('Failed to create backup: {}', error);
        // 删除可能部分创建的备份
        if (await fs.pathExists(backupPath)) {
            await fs.remove(backupPath).catch(err => {
                logger.warn('Failed to remove partial backup: {}', err);
            });
        }
        throw error;
    }
}

/**
 * 从备份恢复
 * @param {string} backupPath - 备份目录路径
 * @param {string} targetPath - 目标路径
 * @returns {Promise<void>}
 */
async function restoreFromBackup(backupPath, targetPath) {
    logger.info('Restoring from backup {} to {}', backupPath, targetPath);

    if (!(await fs.pathExists(backupPath))) {
        throw new Error('Backup directory does not exist');
    }

    try {
        // 如果目标目录存在，先删除
        if (await fs.pathExists(targetPath)) {
            await safeRemoveDirectory(targetPath);
        }

        // 使用支持 asar 的函数恢复备份
        await copyDirectoryWithAsarSupport(backupPath, targetPath);

        logger.info('Restore completed successfully');
    } catch (error) {
        logger.error('Failed to restore from backup: {}', error);
        throw error;
    }
}

/**
 * 清理旧备份
 * @param {string} baseDir - 基础目录
 * @param {number} maxAgeDays - 最大保留天数（默认 30）
 * @param {number} minFreeSpaceGB - 最小可用空间（GB，默认 1）
 * @returns {Promise<number>} 清理的备份数量
 */
async function cleanupOldBackups(baseDir, maxAgeDays = 30, minFreeSpaceGB = 1) {
    logger.info('Cleaning up old backups in {}', baseDir);

    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const minFreeBytes = minFreeSpaceGB * 1024 * 1024 * 1024;
    let cleanedCount = 0;

    try {
        const entries = await fs.readdir(baseDir);
        const backups = entries
            .filter(name => name.startsWith('Users.backup.'))
            .map(name => ({
                name,
                path: path.join(baseDir, name),
                timestamp: extractTimestamp(name)
            }))
            .filter(backup => backup.timestamp !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

        // 检查磁盘空间
        const { free } = await fs.statfs(baseDir);

        // 如果磁盘空间不足，清理更多备份
        if (free < minFreeBytes) {
            logger.warn('Low disk space ({}), cleaning more backups', formatBytes(free));
            // 清理到至少保留一个备份
            while (backups.length > 1 && free < minFreeBytes * 2) {
                const backup = backups.shift();
                try {
                    await fs.remove(backup.path);
                    cleanedCount++;
                    logger.info('Removed backup due to low disk space: {}', backup.name);
                } catch (err) {
                    logger.warn('Failed to remove backup {}: {}', backup.name, err);
                }
            }
        }

        // 清理过期备份
        for (const backup of backups) {
            const age = now - backup.timestamp;
            if (age > maxAgeMs) {
                try {
                    await fs.remove(backup.path);
                    cleanedCount++;
                    logger.info('Removed expired backup: {} (age: {} days)', backup.name, (age / (24 * 60 * 60 * 1000)).toFixed(1));
                } catch (err) {
                    logger.warn('Failed to remove backup {}: {}', backup.name, err);
                }
            }
        }

        logger.info('Cleaned up {} old backups', cleanedCount);
        return cleanedCount;
    } catch (error) {
        logger.error('Failed to clean up old backups: {}', error);
        return cleanedCount;
    }
}

/**
 * 验证新路径
 * @param {string} newBasePath
 * @param {string} oldUsersPath
 * @param {boolean} isResetToDefault - 是否是重置到默认路径（允许迁移回默认路径）
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function validateNewPath(newBasePath, oldUsersPath, isResetToDefault = false) {
    try {
        logger.info('Validating new path: {}', newBasePath);

        // 检查路径格式
        if (!path.isAbsolute(newBasePath)) {
            logger.error('Path validation failed: Path must be absolute');
            return { valid: false, error: 'Path must be absolute' };
        }

        // 检查是否是当前路径（除了重置到默认路径的情况）
        if (!isResetToDefault && path.normalize(newBasePath) === path.normalize(path.dirname(oldUsersPath))) {
            logger.error('Path validation failed: Cannot use current path');
            return { valid: false, error: 'Cannot use current path' };
        }

        // 检查是否在用户数据目录内（避免循环）
        // 重置到默认路径时允许使用 userData 路径本身
        const userDataPath = app.getPath('userData');
        if (!isResetToDefault && newBasePath.startsWith(userDataPath)) {
            logger.error('Path validation failed: Cannot use a subdirectory of current data path');
            return { valid: false, error: 'Cannot use a subdirectory of current data path' };
        }

        // 检查写权限
        const testFile = path.join(newBasePath, '.canbox_test_write');
        await fs.ensureDir(newBasePath);
        await fs.writeFile(testFile, 'test');
        await fs.remove(testFile);
        logger.info('Write permission check passed');

        // 检查磁盘空间（粗略估计，获取源目录大小）
        const oldSize = await getDirectorySizeInBytes(oldUsersPath);

        // 获取目标路径所在磁盘的可用空间
        try {
            const destStats = await fs.stat(newBasePath);
            const stats = await fs.statfs(newBasePath);
            const availableSpace = stats.free || stats.bavail * stats.bsize;

            logger.info('Old size: {}, Available space: {}', formatBytes(oldSize), formatBytes(availableSpace));

            if (oldSize > availableSpace) {
                const oldSizeFormatted = formatBytes(oldSize);
                const availableFormatted = formatBytes(availableSpace);
                logger.error('Disk space insufficient');
                return { valid: false, error: `Insufficient disk space. Required: ${oldSizeFormatted}, Available: ${availableFormatted}` };
            }
        } catch (statfsError) {
            // 如果 statfs 失败（比如在 asar 文件系统），跳过空间检查
            logger.warn('Disk space check skipped (statfs failed): {}', statfsError.message);
        }

        logger.info('Path validation passed');
        return { valid: true };
    } catch (error) {
        logger.error('Path validation error: {}', error);
        return { valid: false, error: error.message };
    }
}

/**
 * 验证迁移完整性
 * @param {string} oldUsersPath
 * @param {string} newUsersPath
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function verifyMigration(oldUsersPath, newUsersPath) {
    try {
        // 检查关键文件是否存在
        const criticalFiles = ['apps.json', 'canbox.json'];
        for (const file of criticalFiles) {
            const oldFile = path.join(oldUsersPath, file);
            const newFile = path.join(newUsersPath, file);

            if (await fs.pathExists(oldFile)) {
                if (!(await fs.pathExists(newFile))) {
                    return { success: false, error: `Critical file ${file} not copied` };
                }
            }
        }

        // 检查关键目录是否存在
        const criticalDirs = ['apps', 'data', 'repos'];
        for (const dir of criticalDirs) {
            const oldDir = path.join(oldUsersPath, dir);
            const newDir = path.join(newUsersPath, dir);

            if (await fs.pathExists(oldDir)) {
                if (!(await fs.pathExists(newDir))) {
                    return { success: false, error: `Critical directory ${dir} not copied` };
                }
            }
        }

        // 检查 temp 目录结构是否创建
        const tempApps = path.join(newUsersPath, 'temp', 'apps');
        const tempRepos = path.join(newUsersPath, 'temp', 'repos');

        if (!(await fs.pathExists(tempApps))) {
            return { success: false, error: 'temp/apps directory not created' };
        }
        if (!(await fs.pathExists(tempRepos))) {
            return { success: false, error: 'temp/repos directory not created' };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 完全回滚迁移（从备份恢复）
 * @param {string} backupPath - 备份路径
 * @param {string} oldUsersPath - 原 Users 路径
 * @param {Object} configStore
 * @param {string|null} oldCustomDataRoot
 * @returns {Promise<string|null>} 错误消息，成功返回 null
 */
async function rollbackMigration(backupPath, oldUsersPath, configStore, oldCustomDataRoot) {
    try {
        // 从备份恢复
        await restoreFromBackup(backupPath, oldUsersPath);

        // 恢复原配置
        if (oldCustomDataRoot) {
            configStore.set('customDataRoot', oldCustomDataRoot);
        } else {
            configStore.delete('customDataRoot');
        }
        return null;
    } catch (rollbackError) {
        logger.error('Rollback failed: {}', rollbackError);
        // 返回包含备份信息的错误消息
        return `Migration failed and rollback also failed. Your data backup is preserved at: ${backupPath}. Please manually restore your data if needed.`;
    }
}

/**
 * 迁移用户数据到新位置
 * @param {string} newBasePath
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function migrateUserDataPath(newBasePath) {
    const configStore = getSystemConfigStore();
    const oldCustomDataRoot = configStore.get('customDataRoot');

    // 确定当前 Users 路径
    const currentBasePath = oldCustomDataRoot || app.getPath('userData');
    const oldUsersPath = path.join(currentBasePath, 'Users');

    // 目标路径
    const newUsersPath = path.join(newBasePath, 'Users');

    // 判断是否是重置到默认路径
    const defaultBasePath = app.getPath('userData');
    const isResetToDefault = path.normalize(newBasePath) === path.normalize(defaultBasePath);

    let backupPath = null;

    try {
        // 0. 检查源目录是否存在
        if (!(await fs.pathExists(oldUsersPath))) {
            logger.info('Source directory does not exist: {}', oldUsersPath);
            if (await fs.pathExists(newUsersPath)) {
                // 目标目录存在，说明数据已经在目标位置
                logger.info('Data already exists at destination, only updating configuration');
                configStore.set('customDataRoot', newBasePath);
                return { success: true };
            } else {
                // 源和目标都不存在，没有数据可迁移
                return { success: false, error: 'No data found to migrate' };
            }
        }

        // 1. 创建备份
        logger.info('Step 1: Creating backup...');
        backupPath = await createBackup(oldUsersPath);

        // 如果创建了备份，清理旧备份
        if (backupPath) {
            await cleanupOldBackups(path.dirname(oldUsersPath));
        }

        logger.info('Starting migration from {} to {}', oldUsersPath, newUsersPath);

        // 2. 验证新路径
        logger.info('Step 2: Validating new path...');
        const validation = await validateNewPath(newBasePath, oldUsersPath, isResetToDefault);
        if (!validation.valid) {
            logger.error('Validation failed: {}', validation.error);
            return { success: false, error: validation.error };
        }

        // 3. 如果新目录存在，先删除（覆盖策略）
        logger.info('Step 3: Checking if destination exists...');
        if (await fs.pathExists(newUsersPath)) {
            logger.info('Removing existing directory: {}', newUsersPath);
            await safeRemoveDirectory(newUsersPath);
        }

        // 3. 创建新目录
        logger.info('Step 3: Creating new directory...');
        await fs.ensureDir(newUsersPath);

        // 4. 复制内容（排除 temp）
        logger.info('Step 4: Copying user data...');
        const itemsToCopy = ['appIcon', 'apps', 'data', 'repos', 'logs'];
        const configFiles = ['apps.json', 'appsDev.json', 'canbox.json', 'repos.json'];

        for (const item of itemsToCopy) {
            const src = path.join(oldUsersPath, item);
            const dest = path.join(newUsersPath, item);
            if (await fs.pathExists(src)) {
                logger.info('Copying directory: {} ({} -> {})', item, src, dest);
                await copyDirectoryWithAsarSupport(src, dest);
            } else {
                logger.warn('Source directory does not exist, skipping: {}', src);
            }
        }

        for (const file of configFiles) {
            const src = path.join(oldUsersPath, file);
            const dest = path.join(newUsersPath, file);
            if (await fs.pathExists(src)) {
                logger.info('Copying config file: {} ({} -> {})', file, src, dest);
                await copyFileWithAsarSupport(src, dest);
            } else {
                logger.warn('Source config file does not exist, skipping: {}', src);
            }
        }

        // 5. 创建 temp 目录结构（空目录）
        logger.info('Step 5: Creating temp directory structure...');
        await fs.ensureDir(path.join(newUsersPath, 'temp', 'apps'));
        await fs.ensureDir(path.join(newUsersPath, 'temp', 'repos'));

        // 6. 验证迁移完整性
        logger.info('Step 6: Verifying migration integrity...');
        const verifyResult = await verifyMigration(oldUsersPath, newUsersPath);
        if (!verifyResult.success) {
            logger.error('Verification failed: {}', verifyResult.error);
            throw new Error(verifyResult.error);
        }

        // 7. 更新配置
        logger.info('Step 7: Updating configuration...');
        configStore.set('customDataRoot', newBasePath);

        // 8. 删除原目录
        logger.info('Step 8: Removing old directory...');
        await safeRemoveDirectory(oldUsersPath);

        logger.info('Migration completed successfully!');
        return { success: true };

    } catch (error) {
        logger.error('Migration error, rolling back: {}', error);
        // 从备份回滚
        if (backupPath) {
            const rollbackError = await rollbackMigration(backupPath, oldUsersPath, configStore, oldCustomDataRoot);
            if (rollbackError) {
                return { success: false, error: rollbackError };
            }
        }
        return { success: false, error: error.message };
    }
}

module.exports = {
    migrateUserDataPath,
    getDirectorySize,
    getDirectorySizeInBytes,
    formatBytes,
    createBackup,
    restoreFromBackup,
    cleanupOldBackups
};
