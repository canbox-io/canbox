const logger = require('@modules/utils/logger');

let pinyinModule = null;

/**
 * 延迟加载 pinyin-pro 模块
 */
function getPinyinModule() {
    if (!pinyinModule) {
        try {
            pinyinModule = require('pinyin-pro');
        } catch (e) {
            logger.warn('[AppSearchEngine] pinyin-pro 模块未安装，拼音匹配功能不可用');
            pinyinModule = false;
        }
    }
    return pinyinModule || null;
}

/**
 * 判断字符串是否包含中文字符
 * @param {string} str
 * @returns {boolean}
 */
function hasChinese(str) {
    return /[\u4e00-\u9fff]/.test(str);
}

/**
 * 获取字符串的拼音（全拼和首字母）
 * @param {string} str
 * @returns {{ full: string, first: string }|null}
 */
function getPinyin(str) {
    const pinyin = getPinyinModule();
    if (!pinyin) return null;

    try {
        const full = pinyin.pinyin(str, { toneType: 'none', type: 'array' }).join('');
        const first = pinyin.pinyin(str, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
        return { full, first };
    } catch (e) {
        logger.error('[AppSearchEngine] 拼音转换失败: {}', e.message);
        return null;
    }
}

/**
 * 判断 query 是否是 target 的子序列（字符按顺序出现，可以不连续）
 * 例如：isSubsequence("dbever", "dbeaver") → true
 *      isSubsequence("eave", "beaver") → false（e 和 a 不按顺序）
 * @param {string} query
 * @param {string} target
 * @returns {boolean}
 */
function isSubsequence(query, target) {
    let i = 0;
    for (let j = 0; i < query.length && j < target.length; j++) {
        if (query[i] === target[j]) {
            i++;
        }
    }
    return i === query.length;
}

/**
 * 计算匹配分数
 * @param {string} query - 用户输入的查询字符串
 * @param {string} appName - 应用名称
 * @returns {number} 匹配分数（0 表示不匹配）
 */
function calcMatchScore(query, appName) {
    const lowerQuery = query.toLowerCase().trim();
    const lowerName = appName.toLowerCase().trim();

    if (!lowerQuery) return 0;

    let score = 0;

    // 1. 完全匹配
    if (lowerName === lowerQuery) {
        score = 100;
    }
    // 2. 前缀匹配（以查询开头）
    else if (lowerName.startsWith(lowerQuery)) {
        score = 80;
    }
    // 3. 包含匹配
    else if (lowerName.includes(lowerQuery)) {
        score = 60;
    }
    // 4. 子序列模糊匹配（字符按顺序出现，但可以不连续）
    else if (isSubsequence(lowerQuery, lowerName)) {
        score = 45;
    }
    // 5. 拼音匹配（仅当应用名包含中文时）
    else if (hasChinese(appName)) {
        const pinyin = getPinyin(appName);
        if (pinyin) {
            // 全拼包含匹配
            if (pinyin.full.includes(lowerQuery)) {
                score = 50;
            }
            // 首字母包含匹配
            else if (pinyin.first.includes(lowerQuery)) {
                score = 40;
            }
            // 拼音子序列模糊匹配
            else if (isSubsequence(lowerQuery, pinyin.full) || isSubsequence(lowerQuery, pinyin.first)) {
                score = 35;
            }
        }
    }

    return score;
}

/**
 * 搜索应用
 * @param {string} query - 用户输入
 * @param {Array} apps - 应用列表
 * @param {number} limit - 返回结果数量上限
 * @returns {Array} 匹配的应用列表（带 score 字段）
 */
function searchApps(query, apps, limit = 5) {
    const lowerQuery = query.trim().toLowerCase();

    if (!lowerQuery) {
        // 无输入时返回前 N 个应用（不排序，保持原始顺序）
        return apps.slice(0, limit).map(app => ({ ...app, score: 0 }));
    }

    const scored = apps
        .map(app => ({
            ...app,
            score: calcMatchScore(lowerQuery, app.name)
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
}

module.exports = {
    searchApps,
    calcMatchScore
};
