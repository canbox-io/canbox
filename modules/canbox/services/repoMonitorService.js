const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { app } = require('electron');
const logger = require('@modules/utils/logger');

const { handleError } = require('@modules/canbox/ipc/errorHandler');
const repoUtils = require('@modules/canbox/utils/repoUtils');
const fsUtils = require('@modules/canbox/utils/fs-utils');

const DateFormat = require('@modules/utils/DateFormat');

// 导入electron-store管理器
const { getReposStore } =require('@modules/canbox/main/storageManager');
// 导入路径管理器
const { getReposPath, getReposTempPath } = require('@modules/canbox/main/pathManager');

class RepoMonitorService {
    constructor() {
        // 初始化 electron-store
        this.store = getReposStore();
    }

    /**
     * 计算文件哈希值
     * @param {string} filePath - 文件路径
     * @returns {Promise<string>} - 文件哈希值
     */
    async calculateFileHash(filePath) {
        const crypto = require('crypto');
        const fs = require('fs');
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * 扫描仓库并更新数据
     */
    async scanRepo() {
        try {
            const repos = this.store.get('default') || {};
            logger.monitor.info(`开始扫描仓库，共 ${Object.keys(repos).length} 个仓库`);

            for (const [uid, repoInfo] of Object.entries(repos)) {
                try {
                    logger.monitor.info(`扫描仓库: ${repoInfo.repo} (分支: ${repoInfo.branch})`);
                    
                    const repoUrl = repoInfo.repo;
                    const branch = repoInfo.branch;
                    const uuid = uid;
                    const reposPath = path.join(getReposPath(), uuid);
                    fs.mkdirSync(reposPath, { recursive: true });

                    let appJson, logoPath, modifyFlag = false;
                    const filesToDownload = ['app.json', 'README.md', 'HISTORY.md'];
                    for (const file of filesToDownload) {
                        const fileUrl = repoUtils.getFileUrl(repoUrl, branch, file);
                        const filePath = path.join(reposPath, file);

                        // 下载文件到临时目录
                        let tempFilePath, downloadSuccess = false;
                        const REPOS_TEMP_PATH = getReposTempPath();
                        tempFilePath = path.join(REPOS_TEMP_PATH, file);
                        downloadSuccess = await repoUtils.downloadFileFromRepo(fileUrl, tempFilePath);

                        if (!downloadSuccess) {
                            if (file === 'app.json') {
                                return handleError(new Error('无法下载app.json, 请检查仓库地址是否正确或是否有权限'), 'handleAddAppRepo');
                            }
                            logger.monitor.error(`文件 ${file} 下载失败`);
                            continue;
                        }

                        // 计算下载文件的哈希值
                        const remoteHash = await this.calculateFileHash(tempFilePath);

                        // 对比哈希值
                        const storedHash = this.store.get(`default.${uid}.files.${file.replace(/\./g, '_')}`);
                        if (storedHash === remoteHash) {
                            fs.unlinkSync(tempFilePath); // 哈希一致，删除临时文件
                            logger.monitor.info(`文件 ${file} 未变化，跳过下载`);
                            continue;
                        } else {
                            // 哈希不一致，复制临时文件到目标路径
                            logger.monitor.info(`文件 ${file} 已更新，下载完成`);
                            fs.copyFileSync(tempFilePath, filePath);
                            fs.unlinkSync(tempFilePath); // 删除临时文件
                            // 更新哈希值
                            this.store.set(`default.${uid}.files.${file.replace(/\./g, '_')}`, remoteHash);
                            // 更新修改标识
                            modifyFlag = true;
                        }

                        // 如果是 app.json，下载logo图片
                        if (file === 'app.json') {
                            appJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            if (appJson.logo) {
                                const logoUrl = repoUtils.getFileUrl(repoUrl, branch, appJson.logo);
                                const logoExt = path.extname(appJson.logo);
                                logoPath = path.join(reposPath, `logo${logoExt}`);
                                const logoDir = path.dirname(logoPath);
                                
                                fsUtils.ensureDirExists(logoDir);
                                
                                repoUtils.downloadLogoFromRepo(logoUrl, logoPath).then((logoDownloadSuccess) => {
                                    if (!logoDownloadSuccess) {
                                        logger.monitor.warn(`无法下载logo图片: ${logoUrl}`);
                                    }
                                });
                            }
                        }
                    }
                    if (!modifyFlag) {
                        logger.monitor.info(`扫描仓库: ${repoInfo.repo} (分支: ${repoInfo.branch})结束，仓库未更新`);
                        continue;
                    }

                    // 保存仓库信息
                    const existingFiles = this.store.get(`default.${uid}.files`) || {};
                    repos[uid] = {
                        ...repoInfo,
                        id: appJson.id,
                        name: appJson.name,
                        author: appJson.author || repoInfo.author,
                        version: appJson.version || repoInfo.version,
                        description: appJson.description || repoInfo.description,
                        logo: logoPath,
                        files: existingFiles,
                        createTime: repoInfo.createTime,
                        updateTime: DateFormat.format(new Date()),
                        downloaded: repoInfo.downloaded,
                        downloadTime: repoInfo.downloadTime,
                        toUpdate: true
                    };
                    this.store.set('default', repos);
                    logger.monitor.info(`仓库 ${repoInfo.name} 信息已更新`);
                } catch (error) {
                    logger.monitor.warn(`仓库 ${repoInfo.repo} 扫描失败: ${error.message}`, error);
                    logger.info(`仓库 ${repoInfo.repo} 扫描失败 / Repo ${repoInfo.repo} scan failed: ${error.message}`);
                }
            }
            logger.monitor.info('仓库扫描完成');
            return { success: true };
        } catch (error) {
            logger.monitor.error('扫描失败: {}', error.message);
            return handleError(error, 'scanRepo');
        }
    }

    /**
     * 启动定时扫描任务
     * @param {string} schedule - cron 表达式
     */
    startScheduler(schedule) {
        cron.schedule(schedule, async () => {
            try {
                logger.monitor.info('开始定时扫描任务');
                await this.scanRepo();
                logger.monitor.info('定时扫描任务完成');
            } catch (error) {
                logger.monitor.error(`定时扫描任务失败: ${error.message}`);
            }
        });
        logger.monitor.info(`定时任务已启动，计划: ${schedule}`);
    }
}

module.exports = RepoMonitorService;