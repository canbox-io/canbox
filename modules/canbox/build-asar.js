const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs'); // 使用 original-fs 来操作 asar 文件
const fse = require('fs-extra');
const glob = require('glob'); 
const asar = require('asar');
const { execSync } = require('child_process');

const { getAppsDevStore } = require('@modules/canbox/main/storageManager');
const logger = require('@modules/utils/logger');

/**
 * 打包应用为 asar 文件
 * @param {Object} appDevItem - 应用开发项
 * @returns {Promise<{success: boolean, msg: string}>} - 打包结果
 */
const buildAsar = async (uid) => {
    const appDevInfoData = getAppsDevStore().get('default') || {};
    const appDevItem = appDevInfoData[uid];
    const appJson = JSON.parse(fs.readFileSync(path.join(appDevItem.path, 'app.json'), 'utf8'));
    try {
        const buildConfigPath = path.join(appDevItem.path, 'cb.build.json');
        const buildConfig = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'));

        const outputDir = path.join(appDevItem.path, buildConfig.outputDir);
        const tmpDir = path.join(outputDir, 'tmp');
        const asarPath = path.join(outputDir, `${appJson.id}-${appJson.version}.asar`);

        // 创建输出目录和临时目录
        // app.asar 有其特殊性，它是文件，在linux使用fs.rmSync时代码会尝试以目录方式删除它，实际上它是个文件（fs.state(xxx.asar)）
        // 使用 original-fs 来正确删除包含 asar 文件的目录
        if (originalFs.existsSync(outputDir)) {
            originalFs.rmSync(outputDir, { recursive: true, force: true });
        }
        // fs.mkdirSync(outputDir, { recursive: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        logger.info('outputDir:', outputDir, '\ntmpDir:', tmpDir);

        // 复制文件到临时目录
        buildConfig.files.forEach((pattern) => {
            logger.info('pattern:', pattern);
            const fullPattern = path.join(appDevItem.path, pattern);
            logger.info('fullPattern:', fullPattern);
            const matchedFiles = glob.sync(fullPattern, { nodir: true }); // 匹配所有文件（不包括目录）
            if (matchedFiles.length === 0) {
                logger.warn(`No files matched "${fullPattern}", skipping.`);
                return;
            }

            matchedFiles.forEach((filePath) => {
                const relativePath = path.relative(appDevItem.path, filePath); // 计算相对路径（如 "build/main.js"）
                const destPath = path.join(tmpDir, relativePath); // 目标路径（保持目录结构）

                // 确保目标目录存在
                const destDir = path.dirname(destPath);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }

                // 复制文件
                fs.copyFileSync(filePath, destPath);
            });
        });

        copyNodeModulesWithoutDevDeps(appDevItem, buildConfig);

        // 在临时目录中打包
        await asar.createPackage(tmpDir, asarPath, {
            glob: ['**/*']
        });

        // 删除临时目录
        fs.rmSync(tmpDir, { recursive: true, force: true });

        logger.info(`开始打包应用: ${appJson.id} 版本: ${appJson.version}`);
        // 把目录 outputDir 下所有内容打包为一个zip文件，名字为：${appDevItem.appJson.id}-${appDevItem.appJson.version}
        const zipPath = path.join(outputDir, `${appJson.id}-${appJson.version}.zip`);
        // 使用命令行打包
        if (process.platform === 'win32') {
            execSync(`powershell -Command "Compress-Archive -Path '${outputDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
        } else {
            execSync(`cd "${outputDir}" && zip -r "${zipPath}" *`, { stdio: 'inherit' });
        }
        logger.info('zipPath:', zipPath);
        logger.info(`打包应用: ${appJson.id} 版本: ${appJson.version} 成功`);

        // 删除 outputDir 目录下除了 ${appJson.id}-${appJson.version}.zip 之外的所有文件
        const zipFileName = `${appJson.id}-${appJson.version}.zip`;
        const filesInOutputDir = originalFs.readdirSync(outputDir);
        filesInOutputDir.forEach(file => {
            if (file !== zipFileName) {
                const filePath = path.join(outputDir, file);
                originalFs.rmSync(filePath, { recursive: true, force: true });
                logger.info(`Deleted file: ${filePath}`);
            }
        });

        return { success: true, msg: '打包成功', asarPath };
    } catch (err) {
        logger.error('打包失败 / Build failed: {}', err.message);
        return { success: false, msg: err.message };
    }
};

function copyNodeModulesWithoutDevDeps(appDevItem, buildConfig) {
    const workDir = appDevItem.path;
    const tmpDir = path.join(workDir, buildConfig.outputDir, 'tmp');
    logger.info('tmpDir:', tmpDir);
    // const buildConfig = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8'));
    const packageJson = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
    // path.join(workDir, 'package.json');
    const dependencies = Object.keys(packageJson.dependencies || {});
    const devDependencies = Object.keys(packageJson.devDependencies || {});
    const optionalDependencies = Object.keys(packageJson.optionalDependencies || {});

    // 要排除的依赖（devDependencies + optionalDependencies）
    const excludedDeps = [...devDependencies, ...optionalDependencies];

    // 确保 node_modules 存在
    const nodeModulesSrc = path.join(workDir, 'node_modules');
    const nodeModulesDest = path.join(tmpDir, 'node_modules');

    if (!fs.existsSync(nodeModulesSrc)) {
        logger.warn('node_modules not found, skipping.');
        return;
    }

    logger.info('dependencies count:', dependencies.length);
    // 遍历 dependencies 并复制
    dependencies.forEach((dep) => {
        if (excludedDeps.includes(dep)) {
            logger.info(`Skipping devDependency: ${dep}`);
            return;
        }

        const depSrc = path.join(nodeModulesSrc, dep);
        const depDest = path.join(nodeModulesDest, dep);

        if (fs.existsSync(depSrc)) {
            fse.copySync(depSrc, depDest); // 递归复制整个依赖目录
        } else {
            logger.warn(`Dependency "${dep}" not found in node_modules.`);
        }
    });

    logger.info('node_modules copied (excluding devDependencies).');
}

module.exports = { buildAsar };