/**
 * File Task 模块
 * 统一导出
 */

const FileTaskState = require('./file-task-state');
const FileTaskPath = require('./file-path');
const FileOperation = require('./file-operation');
const FileTaskQueue = require('./file-task-queue');
const FileTaskManager = require('./file-task-manager');
const FileTaskIPC = require('./file-task-ipc');

module.exports = {
    FileTaskState,
    FileTaskPath,
    FileOperation,
    FileTaskQueue,
    FileTaskManager,
    FileTaskIPC,
};
