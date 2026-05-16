/**
 * 镜像加速更新源提供商
 *
 * 通过国内 GitHub 代理加速访问 GitHub Release 文件
 *
 * 工作原理：
 * - feedURL 指向代理地址，代理从 GitHub Release 拉取文件返回给客户端
 * - 文件仍然存储在 GitHub Release 上，代理只做链路加速
 * - 支持多个代理备选，自动测速选择最优
 */

const axios = require('axios');
const BaseProvider = require('./baseProvider');
const logger = require('@modules/utils/logger');

const MIRROR_LIST = [
    { name: 'ghproxy', url: 'https://ghproxy.com' },
    { name: 'ghfast', url: 'https://ghfast.top' },
    { name: 'ghgo', url: 'https://ghgo.xyz' }
];

const DEFAULT_MIRROR = MIRROR_LIST[0];

class MirrorProvider extends BaseProvider {
    constructor(options = {}) {
        super({
            name: 'mirror',
            owner: options.owner || 'rexlevin',
            repo: options.repo || 'canbox',
            ...options
        });
        this.mirrorUrl = options.mirrorUrl || DEFAULT_MIRROR.url;
        this.mirrorName = options.mirrorName || DEFAULT_MIRROR.name;
        this.githubBaseUrl = options.githubBaseUrl || 'https://github.com';
        logger.debug('[MirrorProvider] 初始化: {}/{}, 代理: {}', this.owner, this.repo, this.mirrorUrl);
    }

    /**
     * 获取 feedURL
     * @returns {string}
     */
    getFeedURL() {
        return `${this.mirrorUrl}/${this.githubBaseUrl}/${this.owner}/${this.repo}/releases/latest/download`;
    }

    /**
     * 获取 GitHub 直连的 feedURL（降级用）
     * @returns {string}
     */
    getFallbackFeedURL() {
        return `${this.githubBaseUrl}/${this.owner}/${this.repo}/releases/latest/download`;
    }

    /**
     * 测试连接
     * 通过代理请求 latest.yml 的一小部分来测试连通性
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<{available: boolean, latency: number}>}
     */
    async testConnection(timeout = 5000) {
        const startTime = Date.now();
        try {
            const feedURL = this.getFeedURL();
            const { platform } = process;
            const ymlFile = platform === 'win32' ? 'latest.yml' : 'latest-linux.yml';
            const url = `${feedURL}/${ymlFile}`;

            await axios.head(url, {
                timeout,
                maxRedirects: 5
            });

            const latency = Date.now() - startTime;
            logger.debug('[MirrorProvider] 连接测试成功，代理: {}，延迟: {}ms', this.mirrorName, latency);
            return { available: true, latency };
        } catch (error) {
            const latency = Date.now() - startTime;
            logger.debug('[MirrorProvider] 连接测试失败，代理: {}，错误: {}', this.mirrorName, error.message);
            return { available: false, latency };
        }
    }

    /**
     * 测试所有可用代理，返回最优代理
     * @param {Object} options - 配置选项
     * @param {string} options.owner - 仓库所有者
     * @param {string} options.repo - 仓库名称
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<MirrorProvider|null>}
     */
    static async findBestMirror(options = {}, timeout = 5000) {
        const owner = options.owner || 'rexlevin';
        const repo = options.repo || 'canbox';

        logger.info('[MirrorProvider] 开始测试 {} 个代理', MIRROR_LIST.length);

        const results = await Promise.all(
            MIRROR_LIST.map(async (mirror) => {
                const provider = new MirrorProvider({
                    owner,
                    repo,
                    mirrorUrl: mirror.url,
                    mirrorName: mirror.name
                });
                const result = await provider.testConnection(timeout);
                return {
                    mirror,
                    provider,
                    ...result
                };
            })
        );

        const available = results.filter(r => r.available).sort((a, b) => a.latency - b.latency);

        if (available.length === 0) {
            logger.warn('[MirrorProvider] 所有代理均不可用');
            return null;
        }

        const best = available[0];
        logger.info('[MirrorProvider] 最优代理: {} ({}), 延迟: {}ms', best.mirror.name, best.mirror.url, best.latency);
        return best.provider;
    }

    /**
     * 获取提供商信息
     * @returns {Object}
     */
    getInfo() {
        return {
            name: this.name,
            mirrorName: this.mirrorName,
            mirrorUrl: this.mirrorUrl,
            owner: this.owner,
            repo: this.repo,
            feedUrl: this.getFeedURL(),
            fallbackUrl: this.getFallbackFeedURL()
        };
    }
}

MirrorProvider.MIRROR_LIST = MIRROR_LIST;

module.exports = MirrorProvider;
