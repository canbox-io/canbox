/**
 * 地区检测模块
 *
 * 用于检测用户所在地区，以便智能选择更新源
 *
 * 检测策略：
 * 1. 优先检查系统语言环境 (zh-CN → 国内源)
 * 2. 可以扩展为通过 IP 地址检测
 */

const { app } = require('electron');
const logger = require('@modules/utils/logger');

/**
 * 检测用户语言环境
 * @returns {string} 语言代码，如 'zh-CN', 'en-US'
 */
function getSystemLocale() {
    try {
        const locale = app.getLocale() || process.env.LANG || '';
        logger.debug('[RegionDetector] 系统语言: {}', locale);
        return locale;
    } catch (error) {
        logger.warn('[RegionDetector] 获取系统语言失败: {}', error.message);
        return '';
    }
}

/**
 * 检测用户是否在中国
 * @returns {Promise<{isChina: boolean, locale: string, confidence: number}>}
 */
async function detectRegion() {
    const locale = getSystemLocale();
    const isChina = locale.startsWith('zh');

    logger.info('[RegionDetector] 地区检测结果: isChina={}, locale={}', isChina, locale);

    return {
        isChina,
        locale,
        confidence: isChina ? 0.8 : 0.5  // 语言检测置信度较低，可后续扩展 IP 检测
    };
}

/**
 * 快速判断是否可能在国内
 * 基于语言环境，不涉及网络请求
 * @returns {boolean}
 */
function isProbablyChina() {
    const locale = getSystemLocale();
    return locale.startsWith('zh');
}

/**
 * 获取推荐的更新源
 * @returns {Promise<{source: string, reason: string}>}
 */
async function getRecommendedSource() {
    const detection = await detectRegion();

    if (detection.isChina) {
        return {
            source: 'mirror',
            reason: `系统语言为 ${detection.locale}，推荐使用镜像加速源`
        };
    }

    return {
        source: 'github',
        reason: `系统语言为 ${detection.locale}，推荐使用 GitHub 源`
    };
}

module.exports = {
    getSystemLocale,
    detectRegion,
    isProbablyChina,
    getRecommendedSource
};
