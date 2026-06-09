const log4js = require('log4js');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const pathManager = require('@modules/canbox/main/pathManager');

// 获取日志目录路径
function getLogDir() {
    try {
        return path.join(pathManager.getUsersPath(), 'logs');
    } catch (error) {
        // 如果 pathManager 还没准备好，使用默认路径
        return path.join(app.getPath('userData'), 'Users', 'logs');
    }
}

// 初始配置：只有 console appender
log4js.configure({
    appenders: {
        console: {
            type: 'console',
            layout: {
                type: 'pattern',
                pattern: '%[[%d{yyyy-MM-dd hh:mm:ss}] [%p] %m%]'
            }
        }
    },
    categories: {
        default: {
            appenders: ['console'],
            level: 'info'
        },
        monitor: {
            appenders: ['console'],
            level: 'info'
        }
    }
});

// 添加文件 appender（延迟配置）
function configureFileAppenders() {
    const logDir = getLogDir();
    const logFile = path.join(logDir, 'app.log');
    const monitorLogFile = path.join(logDir, 'monitor.log');

    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // 手动处理日志轮转，避免 log4js 覆盖已存在的归档文件
    if (fs.existsSync(logFile)) {
        try {
            const content = fs.readFileSync(logFile, 'utf-8');
            const firstLine = content.split('\n')[0];
            const dateMatch = firstLine.match(/\[(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                const logDate = dateMatch[1];
                const today = new Date().toISOString().split('T')[0];

                // 如果日志日期不是今天，说明需要轮转
                if (logDate !== today) {
                    const archiveFile = path.join(logDir, `app.${logDate}.log.gz`);
                    const tempFile = path.join(logDir, `app.${logDate}.log`);

                    // 如果归档文件已存在，先备份
                    if (fs.existsSync(archiveFile)) {
                        const backupFile = path.join(logDir, `app.${logDate}.log.gz.backup`);
                        if (fs.existsSync(backupFile)) {
                            fs.unlinkSync(backupFile);
                        }
                        fs.copyFileSync(archiveFile, backupFile);
                    }

                    // 将 app.log 移动到临时文件
                    fs.renameSync(logFile, tempFile);

                    // 压缩临时文件
                    const zlib = require('zlib');
                    const compressed = zlib.gzipSync(fs.readFileSync(tempFile));

                    // 删除已存在的归档文件
                    if (fs.existsSync(archiveFile)) {
                        fs.unlinkSync(archiveFile);
                    }

                    // 写入新的归档文件
                    fs.writeFileSync(archiveFile, compressed);

                    // 删除临时文件
                    fs.unlinkSync(tempFile);

                    logger.info('[configureFileAppenders] Rotated app.log to {}', archiveFile);
                }
            }
        } catch (error) {
            logger.error('[configureFileAppenders] Failed to rotate app.log: {}', error.message);
        }
    }

    // 对 monitor.log 执行同样的处理
    if (fs.existsSync(monitorLogFile)) {
        try {
            const content = fs.readFileSync(monitorLogFile, 'utf-8');
            const firstLine = content.split('\n')[0];
            const dateMatch = firstLine.match(/\[(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                const logDate = dateMatch[1];
                const today = new Date().toISOString().split('T')[0];

                if (logDate !== today) {
                    const archiveFile = path.join(logDir, `monitor.${logDate}.log.gz`);
                    const tempFile = path.join(logDir, `monitor.${logDate}.log`);

                    // 备份已存在的归档文件
                    if (fs.existsSync(archiveFile)) {
                        const backupFile = path.join(logDir, `monitor.${logDate}.log.gz.backup`);
                        if (fs.existsSync(backupFile)) {
                            fs.unlinkSync(backupFile);
                        }
                        fs.copyFileSync(archiveFile, backupFile);
                    }

                    fs.renameSync(monitorLogFile, tempFile);
                    const zlib = require('zlib');
                    const compressed = zlib.gzipSync(fs.readFileSync(tempFile));

                    if (fs.existsSync(archiveFile)) {
                        fs.unlinkSync(archiveFile);
                    }

                    fs.writeFileSync(archiveFile, compressed);
                    fs.unlinkSync(tempFile);

                    logger.info('[configureFileAppenders] Rotated monitor.log to {}', archiveFile);
                }
            }
        } catch (error) {
            logger.error('[configureFileAppenders] Failed to rotate monitor.log: {}', error.message);
        }
    }

    // 注意：日志清理在 configureFileAppenders 之后手动执行
    // 因为此时 storageManager 可能还未初始化，避免循环依赖
    // 清理逻辑移到了 main.js 中执行

    // 重新配置 log4js，添加 dateFile appender
    log4js.configure({
        appenders: {
            console: {
                type: 'console',
                layout: {
                    type: 'pattern',
                    pattern: '%[[%d{yyyy-MM-dd hh:mm:ss}] [%p] %m%]'
                }
            },
            file: {
                type: 'dateFile',
                filename: logFile,
                pattern: 'yyyy-MM-dd',
                compress: true,
                keepFileExt: true,
                alwaysIncludePattern: false,
                layout: {
                    type: 'pattern',
                    pattern: '[%d{yyyy-MM-dd hh:mm:ss}] [%p] %m'
                }
            },
            monitor: {
                type: 'dateFile',
                filename: path.join(logDir, 'monitor.log'),
                pattern: 'yyyy-MM-dd',
                compress: true,
                keepFileExt: true,
                alwaysIncludePattern: false,
                layout: {
                    type: 'pattern',
                    pattern: '[%d{yyyy-MM-dd hh:mm:ss}] [%p] %m'
                }
            }
        },
        categories: {
            default: {
                appenders: ['console', 'file'],
                level: 'info'
            },
            monitor: {
                appenders: ['monitor'],
                level: 'info'
            }
        }
    });
}

// 创建 logger 实例
const logger = log4js.getLogger();

// 获取调用位置信息
const getCallerInfo = () => {
    const err = new Error();
    Error.captureStackTrace(err);
    const stack = err.stack.split('\n');

    // 跳过当前函数和 logger.js 的调用栈
    for (let i = 3; i < stack.length; i++) {
        const callerLine = stack[i] || '';
        // 支持多种调用栈格式（同步/异步/Electron主进程）
        const match = callerLine.match(/\(?(.+):(\d+):(\d+)\)?/) || callerLine.match(/at (.+):(\d+):(\d+)/);
        if (match) {
            const file = path.basename(match[1]);
            return { file, line: match[2] };
        }
    }

    // 如果无法解析，返回默认值
    return { file: 'unknown', line: '0' };
};

// 创建 monitor logger 实例
const monitorLogger = log4js.getLogger('monitor');

// 创建日志方法的公共函数
const formatMessage = (message, ...args) => {
    let formatted = message;
    args.forEach(arg => {
        formatted = formatted.replace(/{}/, arg);
    });
    return formatted;
};

const createLoggerMethods = (loggerInstance, category = 'default') => {
    return {
        info: (message, ...args) => {
            const { file, line } = getCallerInfo();
            const formattedMessage = formatMessage(message, ...args);
            const logMessage = `[${file}:${line}] : ${formattedMessage}`;
            loggerInstance.info(logMessage);
        },
        error: (message, ...args) => {
            const { file, line } = getCallerInfo();
            const formattedMessage = formatMessage(message, ...args);
            const logMessage = `[${file}:${line}] : ${formattedMessage}`;
            loggerInstance.error(logMessage);
        },
        warn: (message, ...args) => {
            const { file, line } = getCallerInfo();
            const formattedMessage = formatMessage(message, ...args);
            const logMessage = `[${file}:${line}] : ${formattedMessage}`;
            loggerInstance.warn(logMessage);
        },
        debug: (message, ...args) => {
            const { file, line } = getCallerInfo();
            const formattedMessage = formatMessage(message, ...args);
            const logMessage = `[${file}:${line}] : ${formattedMessage}`;
            loggerInstance.debug(logMessage);
        }
    };
};

// 从文件读取日志
function getLogsFromFile(date, source = 'app') {
    const logDir = getLogDir();
    const prefix = source === 'monitor' ? 'monitor' : 'app';
    const zlib = require('zlib');

    // 确定文件名
    let filename;
    const today = new Date().toISOString().split('T')[0];

    if (!date || date === 'today' || date === today) {
        filename = `${prefix}.log`;
    } else {
        filename = `${prefix}.${date}.log.gz`;
    }

    const filePath = path.join(logDir, filename);
    const logs = [];
    let idCounter = 0;  // 用于生成唯一ID

    try {
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return logs;
        }

        // 读取文件内容
        let content;
        if (filename.endsWith('.gz')) {
            // 解压并读取
            const compressedData = fs.readFileSync(filePath);
            content = zlib.gunzipSync(compressedData).toString('utf-8');
        } else {
            // 直接读取
            content = fs.readFileSync(filePath, 'utf-8');
        }

        // 统一换行符为 \n，兼容 Windows 的 \r\n
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = content.split('\n').filter(line => line.trim());

        // 解析日志行 - 支持多种格式
        lines.forEach((line, index) => {
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

    } catch (error) {
        logger.error('Failed to read log file {}: {}', filePath, error.message);
    }

    return logs;
}

// 获取所有日志文件列表
function getLogFiles(source = 'app') {
    const logDir = getLogDir();
    const prefix = source === 'monitor' ? 'monitor' : 'app';
    const files = [];

    try {
        const allFiles = fs.readdirSync(logDir);
        const logFiles = allFiles.filter(file =>
            file.startsWith(prefix) && (file.endsWith('.log') || file.endsWith('.log.gz'))
        );

        // 按日期排序（最新的在前）
        logFiles.sort((a, b) => b.localeCompare(a));

        // 提取日期信息
        logFiles.forEach(file => {
            const match = file.match(new RegExp(`${prefix}\\.?(\\d{4}-\\d{2}-\\d{2})?`));
            const date = match && match[1] ? match[1] : new Date().toISOString().split('T')[0];
            const isCompressed = file.endsWith('.gz');

            files.push({
                filename: file,
                path: path.join(logDir, file),
                date: date,
                source: source,
                compressed: isCompressed
            });
        });
    } catch (error) {
        logger.error('Failed to get log files: {}', error.message);
    }

    return files;
}

// 清理超过保留天数的日志
function cleanupOldLogs(days = 30) {
    const logDir = getLogDir();
    const now = new Date();
    const nowStr = now.toISOString().split('T')[0]; // 格式：2026-03-12

    // 计算截止日期：保留 n 份归档文件，所以删除 (now - n - 1) 天之前的文件
    // 例如：保留8天，删除 2026-03-03 之前的文件（即保留 2026-03-04 到 2026-03-11）
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    logger.info('[cleanupOldLogs] Cleaning logs older than {} days, cutoff date: {}', days, cutoffDateStr);

    let deletedCount = 0;
    const deletedFiles = [];
    const checkedFiles = [];

    try {
        if (!fs.existsSync(logDir)) {
            return { deletedCount: 0, deletedFiles: [] };
        }

        const files = fs.readdirSync(logDir);

        files.forEach(file => {
            // 只处理日志文件（带日期的归档文件）
            // 匹配格式：app.2024-03-08.log.gz 或 app.2024-03-08.log
            const match = file.match(/^(app|monitor)\.(\d{4}-\d{2}-\d{2})\.log(\.gz)?$/);
            if (!match) {
                // 跳过当天正在写入的日志文件（app.log, monitor.log）和其他文件
                return;
            }

            const [, prefix, dateStr] = match;
            const fileDate = new Date(dateStr);

            // 检查日期是否有效
            if (isNaN(fileDate.getTime())) {
                logger.warn('[cleanupOldLogs] Invalid date in filename: {}', file);
                return;
            }

            checkedFiles.push({
                file,
                dateStr,
                fileDate: fileDate.toISOString(),
                daysOld: Math.floor((now - fileDate) / (1000 * 60 * 60 * 24))
            });

            // 直接比较日期字符串，避免时区问题
            // 删除截止日期之前的文件（严格小于）
            const shouldDelete = dateStr < cutoffDateStr;

            if (shouldDelete) {
                const filePath = path.join(logDir, file);
                try {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    deletedFiles.push(file);
                } catch (deleteError) {
                    logger.error('[cleanupOldLogs] Failed to delete {}: {}', file, deleteError.message);
                }
            }
        });

        if (deletedCount > 0) {
            logger.info('[cleanupOldLogs] Deleted {} log files: {}', deletedCount, deletedFiles.join(', '));
        }
    } catch (error) {
        logger.error('[cleanupOldLogs] Failed to cleanup old logs: {}', error.message);
    }

    return { deletedCount, deletedFiles };
}

// 导出接口
module.exports = {
    ...createLoggerMethods(logger, 'app'),
    monitor: createLoggerMethods(monitorLogger, 'monitor'),
    configureFileAppenders,
    getLogsFromFile,
    getLogFiles,
    cleanupOldLogs
};