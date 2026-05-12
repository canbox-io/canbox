/**
 * 速度测试模块
 *
 * 用于测试各个更新源的响应速度，以便选择最优源
 */

const GitHubProvider = require('./providers/githubProvider');
const GiteeProvider = require('./providers/giteeProvider');
const logger = require('@modules/utils/logger');

/**
 * 测试单个源的速度
 * @param {BaseProvider} provider - 提供商实例
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<{name: string, available: boolean, latency: number}>}
 */
async function testProvider(provider, timeout = 5000) {
    const startTime = Date.now();
    try {
        const result = await provider.testConnection(timeout);
        return {
            name: provider.name,
            available: result.available,
            latency: result.latency || (Date.now() - startTime)
        };
    } catch (error) {
        logger.debug('[SpeedTester] {} 测试失败: {}', provider.name, error.message);
        return {
            name: provider.name,
            available: false,
            latency: Infinity
        };
    }
}

/**
 * 测试所有源的速度
 * @param {Object} options - 配置选项
 * @param {string} options.githubOwner - GitHub 仓库所有者
 * @param {string} options.githubRepo - GitHub 仓库名称
 * @param {string} options.giteeOwner - Gitee 仓库所有者
 * @param {string} options.giteeRepo - Gitee 仓库名称
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Array<{name: string, available: boolean, latency: number}>>}
 */
async function testAllSources(options = {}, timeout = 5000) {
    const providers = [];

    if (options.githubOwner && options.githubRepo) {
        providers.push(new GitHubProvider({
            owner: options.githubOwner,
            repo: options.githubRepo
        }));
    }

    if (options.giteeOwner && options.giteeRepo) {
        providers.push(new GiteeProvider({
            owner: options.giteeOwner,
            repo: options.giteeRepo
        }));
    }

    logger.info('[SpeedTester] 开始测试 {} 个源', providers.length);

    const results = await Promise.all(
        providers.map(provider => testProvider(provider, timeout))
    );

    results.sort((a, b) => {
        if (!a.available && !b.available) return 0;
        if (!a.available) return 1;
        if (!b.available) return -1;
        return a.latency - b.latency;
    });

    logger.info('[SpeedTester] 测试结果: {}', JSON.stringify(results));

    return results;
}

/**
 * 获取最优源
 * @param {Object} options - 配置选项
 * @returns {Promise<{name: string, latency: number}|null>}
 */
async function getBestSource(options = {}) {
    const results = await testAllSources(options);

    const available = results.filter(r => r.available);
    if (available.length === 0) {
        logger.warn('[SpeedTester] 所有源都不可用');
        return null;
    }

    const best = available[0];
    logger.info('[SpeedTester] 最优源: {} (延迟: {}ms)', best.name, best.latency);

    return best;
}

module.exports = {
    testProvider,
    testAllSources,
    getBestSource
};
