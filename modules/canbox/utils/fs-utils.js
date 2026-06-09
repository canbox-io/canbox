const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('@modules/utils/logger');

/**
 * 递归创建目录
 * @param {string} dirPath - 目录路径
 */
function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * 删除目录及其内容
 * @param {string} dirPath - 目录路径
 */
function removeDir(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
}

/**
 * 复制文件
 * @param {string} source - 源文件路径
 * @param {string} target - 目标文件路径
 */
function copyFile(source, target) {
    fs.copyFileSync(source, target);
}

/**
 * 执行系统命令
 * @param {string} command - 命令字符串
 */
function executeCommand(command) {
    execSync(command, { stdio: 'inherit' });
}

/**
 * 清空目录内容
 * @param {string} dirPath - 目录路径
 */
function clearDir(dirPath) {
    for (const file of fs.readdirSync(dirPath)) {
        const fullPath = path.join(dirPath, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            clearDir(fullPath); // 递归删除子目录
            fs.rmdirSync(fullPath);
        } else {
            fs.unlinkSync(fullPath); // 删除文件
        }
    }
}

function moveDirectoryContents(sourceDir, targetDir) {
    // 确保目标目录存在
    try {
        fs.accessSync(targetDir);
    } catch (err) {
        if (err.code === 'ENOENT') {
            fs.mkdirSync(targetDir, { recursive: true });
            logger.info(`创建目标目录: ${targetDir} / Create target directory: ${targetDir}`);
        } else {
            throw err;
        }
    }

    // 读取源目录内容
    const items = fs.readdirSync(sourceDir, { withFileTypes: true });
    
    for (const item of items) {
        const sourcePath = path.join(sourceDir, item.name);
        const targetPath = path.join(targetDir, item.name);

        try {
            // 移动前检查目标路径
            handleTargetPath(targetPath, item);
            fs.renameSync(sourcePath, targetPath);
            logger.info(`移动成功: ${item.name} / Move successful: ${item.name}`);
        } catch (err) {
            logger.error(`移动失败: ${item.name}: ${err.message} / Move failed: ${item.name}: ${err.message}`);
        }
    }
}

function handleTargetPath(targetPath, sourceItem) {
    try {
        const targetStat = fs.statSync(targetPath);
        
        // 冲突处理策略
        if (sourceItem.isDirectory()) {
            if (targetStat.isDirectory()) {
                // 目录合并（保留目标目录内容）
                mergeDirectories(targetPath, sourceItem.path);
            } else {
                throw new Error('目标路径存在同名文件');
            }
        } else {
            if (targetStat.isDirectory()) {
                throw new Error('目标路径存在同名目录');
            }
            // 覆盖文件
            fs.unlinkSync(targetPath);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

function mergeDirectories(targetDir, sourceDir) {
    const items = fs.readdirSync(sourceDir);
    for (const name of items) {
        const sourcePath = path.join(sourceDir, name);
        const targetPath = path.join(targetDir, name);
        
        const sourceStat = fs.statSync(sourcePath);
        if (sourceStat.isDirectory()) {
            mergeDirectories(targetPath, sourcePath);
        } else {
            fs.renameSync(sourcePath, targetPath);
        }
    }
}

module.exports = {
    ensureDirExists,
    removeDir,
    copyFile,
    executeCommand,
    clearDir,
    moveDirectoryContents
};