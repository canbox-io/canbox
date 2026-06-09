const logger = require('@modules/utils/logger');

/**
 * 通用的错误处理函数
 * @param {Error} error - 错误对象
 * @param {string} context - 错误发生的上下文
 * @returns {Object} - 包含错误信息的对象
 */
function handleError(error, context) {
    logger.error(`[${context}] Error / 错误: {}`, error.message || 'Unknown error / 未知错误');
    return {
        success: false,
        msg: error.message || '未知错误'
    };
}

/**
 * 初始化错误处理相关的 IPC 逻辑
 */
function initErrorHandlers() {
    // 可以在此处添加其他错误处理相关的 IPC 逻辑
}

module.exports = {
    handleError,
    init: initErrorHandlers
};