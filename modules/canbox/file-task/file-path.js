/**
 * 文件任务路径解析
 * 提供统一的路径获取接口
 */
const path = require('path');
const pathManager = require('@modules/canbox/main/pathManager');

const FileTaskPath = {
    /**
     * 获取临时目录基础路径
     * @param {string} type - 任务类型
     * @returns {string} 临时目录基础路径
     */
    getTempBasePath(type) {
        switch (type) {
            case 'app-import':
            case 'app-pack':
            case 'app-export':
                return pathManager.getAppTempPath();  // Users/temp/apps
            case 'repo-download':
            case 'app-update':
                return pathManager.getReposTempPath(); // Users/temp/repos
            default:
                return pathManager.getTempPath();
        }
    },

    /**
     * 生成任务临时目录路径
     * @param {string} type - 任务类型
     * @param {string} uid - 业务标识
     * @returns {string} 任务临时目录路径
     */
    getTaskTempPath(type, uid) {
        return path.join(this.getTempBasePath(type), `${type}-${uid}`);
    },

    /**
     * 获取应用存储路径
     * @returns {string} 应用存储路径
     */
    getAppPath() {
        return pathManager.getAppPath();
    },

    /**
     * 获取仓库存储路径
     * @returns {string} 仓库存储路径
     */
    getReposPath() {
        return pathManager.getReposPath();
    },
};

module.exports = FileTaskPath;
