const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs');
const logger = require('@modules/utils/logger');

/**
 * 校验仓库地址格式
 * @param {string} repoUrl - 仓库地址
 * @returns {boolean} - 是否有效
 */
exports.validateRepoUrl = function (repoUrl) {
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    return urlPattern.test(repoUrl);
};

/**
 * 根据仓库类型生成文件下载 URL
 * @param {string} repoUrl - 仓库地址
 * @param {string} branch - 分支
 * @param {string} file - 文件路径
 * @returns {string} - 文件下载 URL
 */
exports.getFileUrl = function (repoUrl, branch, file) {
    try {
        const url = new URL(repoUrl);
        const host = url.hostname;

        // 移除末尾的 .git 后缀（如果有）
        let cleanRepoUrl = repoUrl;
        if (cleanRepoUrl.endsWith('.git')) {
            cleanRepoUrl = cleanRepoUrl.slice(0, -4);
        }

        // GitHub
        if (host.includes('github.com')) {
            const repoPath = cleanRepoUrl.split('/').slice(3).join('/');
            return `https://raw.githubusercontent.com/${repoPath}/${branch}/${file}`;
        }
        // GitLab
        else if (host.includes('gitlab.com') || host.includes('gitlab.')) {
            return `${cleanRepoUrl}/-/raw/${branch}/${file}`;
        }
        // Bitbucket
        else if (host.includes('bitbucket.org')) {
            return `${cleanRepoUrl}/raw/${branch}/${file}`;
        }
        // Gitee
        else if (host.includes('gitee.com')) {
            return `${cleanRepoUrl}/raw/${branch}/${file}`;
        }
        // 自托管服务（如Gitea/GitLab CE）
        else {
            // 尝试常见模式
            return `${cleanRepoUrl}/raw/branch/${branch}/${file}`;
        }
    } catch (e) {
        logger.error('解析仓库URL失败 / Failed to parse repo URL: {}', e.message);
        // 如果出错，也尝试移除 .git 后缀
        let cleanUrl = repoUrl;
        if (cleanUrl.endsWith('.git')) {
            cleanUrl = cleanUrl.slice(0, -4);
        }
        return `${cleanUrl}/raw/${branch}/${file}`; // 默认回退
    }
};

/**
 * 根据仓库类型生成下载 URL（用于版本文件或归档文件）
 * @param {string} repo - 仓库地址
 * @param {string} version - 版本号
 * @param {string} fileName - 文件名
 * @returns {string} - 下载 URL
 */
exports.getDownloadUrl = function (repo, version, fileName) {
    try {
        // 移除末尾的 .git 后缀（如果有）
        let cleanRepo = repo;
        if (cleanRepo.endsWith('.git')) {
            cleanRepo = cleanRepo.slice(0, -4);
        }

        const url = new URL(cleanRepo);
        const host = url.hostname;

        // GitHub
        if (host.includes('github.com')) {
            return `${cleanRepo}/releases/download/${version}/${fileName}`;
        }
        // GitLab
        else if (host.includes('gitlab.com')) {
            return `${cleanRepo}/-/archive/v${version}/${fileName}`;
        }
        // Bitbucket
        else if (host.includes('bitbucket.org')) {
            return `${cleanRepo}/downloads/${fileName}`;
        }
        // Gitee
        else if (host.includes('gitee.com')) {
            return `${cleanRepo}/releases/download/${version}/${fileName}`;
        }
        // 自托管服务（如 Gitea/GitLab CE）
        else {
            return `${cleanRepo}/archive/${fileName}`;
        }
    } catch (e) {
        logger.error('解析仓库URL失败 / Failed to parse repo URL: {}', e.message);
        // 如果出错，也尝试移除 .git 后缀
        let cleanRepo = repo;
        if (cleanRepo.endsWith('.git')) {
            cleanRepo = cleanRepo.slice(0, -4);
        }
        return `${cleanRepo}/archive/${fileName}`; // 默认回退
    }
};

/**
 * 下载文件并保存到指定路径
 * @param {string} fileUrl - 文件下载 URL
 * @param {string} filePath - 保存路径
 * @returns {Promise<boolean>} - 是否成功
 */
exports.downloadFileFromRepo = async function (fileUrl, filePath) {
    try {
        logger.debug(`尝试下载文件 / Attempting to download file: ${fileUrl}`);
        const response = await axios.get(fileUrl, {
            timeout: 30000, // 30秒超时
            responseType: 'text',
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Canbox/0.1.0'
            }
        });
        fs.writeFileSync(filePath, response.data);
        logger.info(`文件下载成功 / File download successful: ${filePath}`);
        return true;
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            logger.warn(`下载超时 / Download timeout: ${fileUrl}`);
        } else if (error.response) {
            logger.warn(`下载失败({}): {} / Download failed ({}): {}: {}`, error.response.status, fileUrl, error.response.status, fileUrl);
            logger.warn(`响应内容 / Response content: {}`, JSON.stringify(error.response.data).substring(0, 200));
        } else {
            logger.error(`下载文件错误({}) / Download file error ({}): {}: {}`, fileUrl, fileUrl, fileUrl, error.message);
        }
        return false;
    }
};

/**
 * 下载图片并保存到指定路径
 * @param {string} fileUrl - 文件下载 URL
 * @param {string} filePath - 保存路径
 * @returns {Promise<boolean>} - 是否成功
 */
exports.downloadLogoFromRepo = async function (fileUrl, filePath) {
    try {
        logger.debug(`尝试下载文件 / Attempting to download file: ${fileUrl}`);
        const isBinary = filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.gif');
        const response = await axios.get(fileUrl, {
            timeout: 30000, // 30秒超时
            responseType: isBinary ? 'arraybuffer' : 'text',
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Canbox/0.1.0'
            }
        });
        if (isBinary) {
            fs.writeFileSync(filePath, Buffer.from(response.data));
        } else {
            fs.writeFileSync(filePath, response.data);
        }
        logger.info(`文件下载成功 / File download successful: ${filePath}`);
        return true;
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            logger.warn(`下载超时 / Download timeout: ${fileUrl}`);
        } else if (error.response) {
            logger.warn(`下载失败({}): {} / Download failed ({}): {}: {}`, error.response.status, fileUrl, error.response.status, fileUrl);
        } else {
            logger.error(`下载文件错误({}) / Download file error ({}): {}: {}`, fileUrl, fileUrl, fileUrl, error.message);
        }
        return false;
    }
};