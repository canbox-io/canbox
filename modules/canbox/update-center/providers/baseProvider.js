/**
 * 更新源提供商抽象基类
 *
 * 定义更新源提供商的接口规范
 */
class BaseProvider {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {string} options.name - 提供商名称 (github/mirror)
     * @param {string} options.owner - 仓库所有者
     * @param {string} options.repo - 仓库名称
     */
    constructor(options = {}) {
        if (new.target === BaseProvider) {
            throw new Error('BaseProvider 是抽象类，不能直接实例化');
        }
        this.name = options.name;
        this.owner = options.owner;
        this.repo = options.repo;
    }

    /**
     * 获取 feedURL
     * @returns {string} feedURL
     */
    getFeedURL() {
        throw new Error('子类必须实现 getFeedURL()');
    }

    /**
     * 获取最新版本信息
     * @returns {Promise<Object|null>}
     */
    async getLatestVersion() {
        throw new Error('子类必须实现 getLatestVersion()');
    }

    /**
     * 测试源是否可用
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<{available: boolean, latency: number}>}
     */
    async testConnection(timeout = 5000) {
        throw new Error('子类必须实现 testConnection()');
    }

    /**
     * 获取提供商信息
     * @returns {Object}
     */
    getInfo() {
        return {
            name: this.name,
            owner: this.owner,
            repo: this.repo,
            feedUrl: this.getFeedURL()
        };
    }
}

module.exports = BaseProvider;
