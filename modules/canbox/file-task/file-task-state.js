/**
 * 文件任务状态枚举
 * 定义任务的生命周期状态
 */
const FileTaskState = {
    IDLE: 'idle',
    PENDING: 'pending',
    PREPARING: 'preparing',
    DOWNLOADING: 'downloading',
    EXTRACTING: 'extracting',
    MOVING: 'moving',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    INTERRUPTED: 'interrupted',
};

/**
 * 运行中的状态列表
 */
const RUNNING_STATES = [
    FileTaskState.PENDING,
    FileTaskState.PREPARING,
    FileTaskState.DOWNLOADING,
    FileTaskState.EXTRACTING,
    FileTaskState.MOVING,
];

/**
 * 终止状态列表
 */
const TERMINAL_STATES = [
    FileTaskState.COMPLETED,
    FileTaskState.FAILED,
    FileTaskState.CANCELLED,
    FileTaskState.INTERRUPTED,
];

/**
 * 判断状态是否为运行中
 * @param {string} status - 状态
 * @returns {boolean}
 */
function isRunningState(status) {
    return RUNNING_STATES.includes(status);
}

/**
 * 判断状态是否为终止状态
 * @param {string} status - 状态
 * @returns {boolean}
 */
function isTerminalState(status) {
    return TERMINAL_STATES.includes(status);
}

/**
 * 任务类型常量
 */
const TASK_TYPES = {
    APP_IMPORT: 'app-import',
    REPO_DOWNLOAD: 'repo-download',
    APP_PACK: 'app-pack',
    APP_UPDATE: 'app-update',
    APP_EXPORT: 'app-export',
};

module.exports = {
    FileTaskState,
    RUNNING_STATES,
    TERMINAL_STATES,
    TASK_TYPES,
    isRunningState,
    isTerminalState,
};
