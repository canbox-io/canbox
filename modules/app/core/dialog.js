const { dialog } = require('electron');

/**
 * 对话框操作模块
 */
const dialogFactory = {
    /**
     * 打开文件对话框
     * @param {Object} options - 对话框配置
     * @returns {Promise} 对话框结果
     */
    showOpenDialog: (options) => {
        return dialog.showOpenDialog(options);
    },

    /**
     * 打开保存对话框
     * @param {Object} options - 对话框配置
     * @returns {Promise} 对话框结果
     */
    showSaveDialog: (options) => {
        return dialog.showSaveDialog(options);
    },

    /**
     * 打开消息对话框
     * @param {Object} options - 对话框配置
     * @returns {Promise} 对话框结果
     */
    showMessageBox: (options) => {
        return dialog.showMessageBox(options);
    }
};

module.exports = dialogFactory;