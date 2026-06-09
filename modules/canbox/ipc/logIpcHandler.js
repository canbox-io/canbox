const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const logger = require('@modules/utils/logger');
const i18nModule = require('../../../locales');
const { getCanboxStore } = require('@modules/canbox/main/storageManager');
const pathManager = require('@modules/canbox/main/pathManager');

// 获取日志目录路径（与 logger.js 保持一致）
function getLogDir() {
    try {
        return path.join(pathManager.getUsersPath(), 'logs');
    } catch (error) {
        // 如果 pathManager 还没准备好，使用默认路径
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'Users', 'logs');
    }
}

/**
 * 日志相关的 IPC 处理器
 */

// 解析日志文件内容
function parseLogContent(content, source) {
    // 统一换行符为 \n，兼容 Windows 的 \r\n
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = content.split('\n').filter(line => line.trim());
    const logs = [];
    let idCounter = 0;

    lines.forEach(line => {
        // 格式1: [2024-01-15 14:30:45] [INFO] [file.js:123] : message
        let match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(\w+)\] (\[.+\]) : (.+)$/);
        if (match) {
            const [, timestamp, level, location, message] = match;
            const now = new Date(timestamp);
            logs.push({
                id: `${now.getTime()}${now.getMilliseconds().toString().padStart(3, '0')}_${idCounter++}`,
                level: level.toLowerCase(),  // 转换为小写，与前端一致
                message: `${location} : ${message}`,
                timestamp: now.toISOString(),
                category: source
            });
            return;
        }

        // 格式2: [2024-01-15 14:30:45] [INFO] [file.js:123] message (没有冒号)
        match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(\w+)\] (\[.+\])\s+(.+)$/);
        if (match) {
            const [, timestamp, level, location, message] = match;
            const now = new Date(timestamp);
            logs.push({
                id: `${now.getTime()}${now.getMilliseconds().toString().padStart(3, '0')}_${idCounter++}`,
                level: level.toLowerCase(),  // 转换为小写，与前端一致
                message: `${location} ${message}`,
                timestamp: now.toISOString(),
                category: source
            });
            return;
        }

        // 格式3: [2024-01-15 14:30:45] [INFO] message (没有位置信息，用于非代码日志)
        match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(\w+)\] (.+)$/);
        if (match) {
            const [, timestamp, level, message] = match;
            const now = new Date(timestamp);
            logs.push({
                id: `${now.getTime()}${now.getMilliseconds().toString().padStart(3, '0')}_${idCounter++}`,
                level: level.toLowerCase(),
                message: message,
                timestamp: now.toISOString(),
                category: source
            });
            return;
        }
    });

    return logs;
}

// 获取日志列表
ipcMain.handle('get-logs', async (event, options = {}) => {
    try {
        const { source = 'app', count = 100, date, afterId } = options;

        let logs;

        if (date && date !== 'today') {
            // 从文件读取指定日期的日志
            logs = logger.getLogsFromFile(date, source);
        } else {
            // 今天的日志：从文件读取
            logs = logger.getLogsFromFile('today', source);
        }

        // 按 source 过滤
        let filteredLogs = logs.filter(log => log.category === source || source === 'all');

        // 如果提供了 afterId，只返回 ID 更大的日志
        if (afterId) {
            filteredLogs = filteredLogs.filter(log => log.id > afterId);
        }

        return {
            success: true,
            logs: filteredLogs
        };
    } catch (error) {
        logger.error('Failed to get logs: {}', error.message);
        return { success: false, error: error.message };
    }
});

// 获取日志文件列表
ipcMain.handle('get-log-files', async (event, source = 'app') => {
    try {
        const files = logger.getLogFiles(source);
        return { success: true, files };
    } catch (error) {
        logger.error('Failed to get log files: ' + error.message);
        return { success: false, error: error.message };
    }
});

// 导出日志
ipcMain.handle('export-logs', async (event, format = 'txt', range = {}) => {
    try {
        const { source = 'app', startDate, endDate } = range;
        const files = logger.getLogFiles(source);

        // 根据日期范围筛选文件
        let selectedFiles = files;
        if (startDate || endDate) {
            selectedFiles = files.filter(file => {
                const fileDate = new Date(file.date);
                if (startDate && fileDate < new Date(startDate)) return false;
                if (endDate && fileDate > new Date(endDate)) return false;
                return true;
            });
        }

        // 选择保存路径
        const { filePath } = await dialog.showSaveDialog({
            title: 'Export Logs',
            defaultPath: `logs_${source}_${new Date().toISOString().split('T')[0]}.${format}`,
            filters: [
                { name: format.toUpperCase() + ' Files', extensions: [format] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (!filePath) {
            return { success: false, error: 'Export cancelled' };
        }

        // 读取并合并日志内容
        let content = '';
        for (const file of selectedFiles) {
            let fileContent;
            if (file.compressed) {
                // 压缩文件需要使用 zlib 解压
                const zlib = require('zlib');
                fileContent = zlib.gunzipSync(fs.readFileSync(file.path)).toString('utf-8');
            } else {
                fileContent = fs.readFileSync(file.path, 'utf-8');
            }
            content += `=== ${file.filename} ===\n${fileContent}\n\n`;
        }

        // 根据格式转换
        if (format === 'json') {
            // 从文件中读取日志并转换为 JSON
            const allLogs = [];
            for (const file of selectedFiles) {
                if (file.compressed) {
                    const zlib = require('zlib');
                    const fileContent = zlib.gunzipSync(fs.readFileSync(file.path)).toString('utf-8');
                    const logs = parseLogContent(fileContent, source);
                    allLogs.push(...logs);
                } else {
                    const fileContent = fs.readFileSync(file.path, 'utf-8');
                    const logs = parseLogContent(fileContent, source);
                    allLogs.push(...logs);
                }
            }
            content = JSON.stringify(allLogs, null, 2);
        }

        fs.writeFileSync(filePath, content, 'utf-8');

        logger.info(`Logs exported to: ${filePath}`);
        return { success: true, filePath };
    } catch (error) {
        logger.error('Failed to export logs: ' + error.message);
        return { success: false, error: error.message };
    }
});

// 清空日志文件
ipcMain.handle('clear-logs', async (event, source = 'app') => {
    try {
        // 获取当前语言
        let currentLanguage = 'zh-CN';
        try {
            const canboxStore = getCanboxStore();
            currentLanguage = canboxStore.get('language', 'zh-CN');
        } catch (e) {
            logger.warn('[clear-logs] Failed to get language, using default: zh-CN');
        }

        // 获取国际化文本
        const cancelText = i18nModule.translate('common.cancel', currentLanguage);
        const confirmText = i18nModule.translate('common.confirm', currentLanguage);
        const titleText = i18nModule.translate('logViewer.confirmClearLogs', currentLanguage);
        const messageText = i18nModule.translate('logViewer.confirmClearLogsDetail', currentLanguage);

        const dialogResult = await dialog.showMessageBox({
            type: 'warning',
            buttons: [cancelText, confirmText],
            defaultId: 0,
            title: titleText,
            message: messageText
        });

        if (dialogResult.response !== 1) {
            return { success: false, error: i18nModule.translate('logViewer.cleanupFailed', currentLanguage) };
        }

        const logDir = getLogDir();
        const prefix = source === 'monitor' ? 'monitor' : 'app';

        // 检查日志目录是否存在
        if (!fs.existsSync(logDir)) {
            logger.info(`Log directory does not exist, nothing to clear for: ${source}`);
            return { success: true };
        }

        const files = fs.readdirSync(logDir).filter(file =>
            file.startsWith(prefix) && file.endsWith('.log')
        );

        files.forEach(file => {
            fs.writeFileSync(path.join(logDir, file), '', 'utf-8');
        });

        logger.info(`Cleared logs for: ${source}`);
        return { success: true };
    } catch (error) {
        logger.error('Failed to clear logs: ' + error.message);
        return { success: false, error: error.message };
    }
});

// 清理选中的日志文件
ipcMain.handle('cleanup-old-logs', async (event, filePaths) => {
    try {
        logger.info('[cleanup-old-logs] Received request with {} files', filePaths?.length || 0);

        if (!Array.isArray(filePaths) || filePaths.length === 0) {
            logger.warn('[cleanup-old-logs] No files selected or invalid format');
            return { success: false, error: i18nModule.translate('logViewer.noFilesToDelete', 'zh-CN') };
        }

        logger.info('[cleanup-old-logs] Files to delete: {}', filePaths.join(', '));

        // 获取当前语言
        let currentLanguage = 'zh-CN';
        try {
            const canboxStore = getCanboxStore();
            currentLanguage = canboxStore.get('language', 'zh-CN');
        } catch (e) {
            logger.warn('[cleanup-old-logs] Failed to get language, using default: zh-CN');
        }

        // 获取国际化文本
        const cancelText = i18nModule.translate('common.cancel', currentLanguage);
        const confirmText = i18nModule.translate('common.confirm', currentLanguage);
        const titleText = i18nModule.translate('logViewer.confirmCleanup', currentLanguage);
        const messageText = i18nModule.translate('logViewer.willDeleteFiles', currentLanguage, { count: filePaths.length });
        const cancelledText = i18nModule.translate('logViewer.cleanupFailed', currentLanguage);

        // 显示确认对话框
        const dialogResult = await dialog.showMessageBox({
            type: 'warning',
            buttons: [cancelText, confirmText],
            defaultId: 0,
            title: titleText,
            message: messageText,
            detail: filePaths.join('\n')
        });

        logger.info('[cleanup-old-logs] Dialog result: {}', JSON.stringify(dialogResult));
        logger.info('[cleanup-old-logs] Dialog response: {}', dialogResult.response);

        if (dialogResult.response !== 1) {
            logger.info('[cleanup-old-logs] Cleanup cancelled by user');
            return { success: false, error: cancelledText };
        }

        // 执行清理
        const deletedFiles = [];
        let deletedCount = 0;

        for (const filePath of filePaths) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deletedFiles.push(filePath);
                    deletedCount++;
                    logger.info('[cleanup-old-logs] Deleted: {}', filePath);
                } else {
                    logger.warn('[cleanup-old-logs] File not found: {}', filePath);
                }
            } catch (error) {
                logger.error('[cleanup-old-logs] Failed to delete {}: {}', filePath, error.message);
            }
        }

        logger.info('[cleanup-old-logs] Cleaned up {} old log files: {}', deletedCount, deletedFiles.join(', '));

        return { success: true, deletedCount, deletedFiles };
    } catch (error) {
        logger.error('[cleanup-old-logs] Failed to cleanup old logs: {}', error.message);
        return { success: false, error: error.message };
    }
});
