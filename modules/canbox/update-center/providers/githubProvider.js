/**
 * GitHub 更新源提供商
 *
 * 提供从 GitHub Releases 获取更新的功能
 *
 * electron-updater 内置了 GitHub 支持，此模块主要用于：
 * - 自定义 GitHub API 调用逻辑
 * - 获取 Release 详细信息
 * - 测试连接状态
 */

const axios = require('axios');
const semver = require('semver');
const BaseProvider = require('./baseProvider');
const logger = require('@modules/utils/logger');

class GitHubProvider extends BaseProvider {
    constructor(options = {}) {
        super({
            name: 'github',
            owner: options.owner || 'canbox-io',
            repo: options.repo || 'canbox',
            ...options
        });
        this.apiBaseUrl = options.apiBaseUrl || 'https://api.github.com';
        this.downloadBaseUrl = options.downloadBaseUrl || 'https://github.com';
        logger.debug('[GitHubProvider] 初始化: {}/{}', this.owner, this.repo);
    }

    /**
     * 获取 feedURL
     * @returns {string}
     */
    getFeedURL() {
        return `${this.downloadBaseUrl}/${this.owner}/${this.repo}/releases/latest/download`;
    }

    /**
     * 获取最新版本信息
     * @param {string} currentVersion - 当前版本
     * @returns {Promise<Object|null>}
     */
    async getLatestVersion(currentVersion) {
        try {
            const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/releases/latest`;
            logger.debug('[GitHubProvider] 获取最新版本: {}', url);

            const response = await axios.get(url, {
                headers: {
                    Accept: 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });

            const release = response.data;
            const latestVersion = release.tag_name.replace(/^v/, '');

            logger.debug('[GitHubProvider] 最新版本: v{}，当前版本: v{}', latestVersion, currentVersion);

            if (semver.valid(currentVersion) && semver.valid(latestVersion)) {
                if (semver.gt(latestVersion, currentVersion)) {
                    logger.info('[GitHubProvider] 发现新版本: v{} -> v{}', currentVersion, latestVersion);
                    return this._formatReleaseInfo(release);
                } else {
                    logger.debug('[GitHubProvider] 当前版本已是最新');
                    return null;
                }
            } else {
                logger.warn('[GitHubProvider] 版本号格式无效: current={}, latest={}', currentVersion, latestVersion);
                return null;
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                logger.error('[GitHubProvider] 仓库不存在或没有发布任何版本');
            } else {
                logger.error('[GitHubProvider] 获取最新版本失败: {}', error.message);
            }
            throw error;
        }
    }

    /**
     * 测试连接
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<{available: boolean, latency: number}>}
     */
    async testConnection(timeout = 5000) {
        const startTime = Date.now();
        try {
            const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}`;
            await axios.get(url, {
                timeout,
                headers: {
                    Accept: 'application/vnd.github.v3+json'
                }
            });
            const latency = Date.now() - startTime;
            logger.debug('[GitHubProvider] 连接测试成功，延迟: {}ms', latency);
            return { available: true, latency };
        } catch (error) {
            const latency = Date.now() - startTime;
            logger.debug('[GitHubProvider] 连接测试失败: {}', error.message);
            return { available: false, latency };
        }
    }

    /**
     * 格式化 Release 信息
     * @param {Object} release
     * @returns {Object}
     * @private
     */
    _formatReleaseInfo(release) {
        return {
            version: release.tag_name.replace(/^v/, ''),
            releaseName: release.name || release.tag_name,
            releaseDate: release.published_at,
            releaseNotes: release.body,
            url: release.html_url,
            assets: release.assets.map(asset => ({
                name: asset.name,
                size: asset.size,
                downloadUrl: asset.browser_download_url,
                contentType: asset.content_type
            }))
        };
    }

    /**
     * 根据平台和架构获取对应的更新包
     * @param {string} platform
     * @param {string} arch
     * @returns {Promise<Object|null>}
     */
    async getUpdateAsset(platform, arch) {
        try {
            logger.debug('[GitHubProvider] 获取更新包: platform={}, arch={}', platform, arch);

            const url = `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}/releases/latest`;
            const response = await axios.get(url, {
                headers: {
                    Accept: 'application/vnd.github.v3+json'
                },
                timeout: 10000
            });

            const release = response.data;
            const assets = release.assets;

            const platformMap = {
                linux: 'linux',
                win32: 'win',
                darwin: 'darwin'
            };

            const archMap = {
                x64: 'x64',
                x64_64: 'x64',
                arm64: 'arm64',
                ia32: 'ia32'
            };

            const platformKey = platformMap[platform] || platform;
            const archKey = archMap[arch] || arch;

            const asset = assets.find(a => {
                const name = a.name.toLowerCase();
                return name.includes(platformKey.toLowerCase()) &&
                       name.includes(archKey.toLowerCase());
            });

            if (!asset) {
                logger.warn('[GitHubProvider] 未找到匹配的更新包: {} {}', platform, arch);
                return null;
            }

            return {
                name: asset.name,
                size: asset.size,
                downloadUrl: asset.browser_download_url,
                contentType: asset.content_type
            };
        } catch (error) {
            logger.error('[GitHubProvider] 获取更新包失败: {}', error.message);
            throw error;
        }
    }
}

module.exports = GitHubProvider;
