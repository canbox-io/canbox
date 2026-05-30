const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');
const os = require('os');
const logger = require('@modules/utils/logger');

const { getCanboxStore } = require('@modules/main/storageManager');
const { getAppPath, getAppIconPath } = require('@modules/main/pathManager');
const { handleError } = require('@modules/ipc/errorHandler');

/**
 * 生成应用快捷方式
 *
 * 不同系统的快捷方式存储路径：
 * Windows: %APPDATA%/Microsoft/Windows/Start Menu/Programs
 * Linux: ~/.local/share/applications
 * macOS: /Applications
 *
 * @param {Object} appsData - 所有应用
 * @returns {Object} - 操作结果
 */
async function generateShortcuts(appsData) {
    if (!appsData || Object.keys(appsData).length === 0) {
        return handleError('应用信息为空', 'generateShortcuts');
    }

    const execPath = process.env.APPIMAGE || process.execPath;

    try {
        for (const [uid, appItem] of Object.entries(appsData)) {
            const hasNonAscii = /[^\x00-\x7F]/.test(appItem.name || '');
            const appName = (appItem.alias && hasNonAscii)
                ? `canbox-${appItem.name} (${appItem.alias})`
                : 'canbox-' + appItem.name;
            let shortcutPath, command;

            // 确保图标缓存目录存在
            if (!fs.existsSync(getAppIconPath())) {
                fs.mkdirSync(getAppIconPath(), { recursive: true });
            }

            // 图标路径
            // Windows 下使用已生成的 ICO 文件，其他系统使用原始格式
            const logoExt = path.extname(appItem.logo).toLowerCase();
            const sourceIconPath = process.platform === 'win32'
                ? path.join(getAppPath(), `${uid}.ico`)
                : path.join(getAppPath(), `${uid}${logoExt}`);

            // 缓存图标路径（所有系统都缓存到同一个位置）
            const iconPath = path.join(getAppIconPath(), `${uid}${path.extname(sourceIconPath)}`);

            // 复制图标到缓存目录（如果不存在或需要更新）
            const needUpdate = !fs.existsSync(iconPath) ||
                (fs.existsSync(sourceIconPath) && fs.statSync(sourceIconPath).mtimeMs > fs.statSync(iconPath).mtimeMs);

            if (needUpdate) {
                // 直接复制图标文件（Windows 下已经转换过 ICO）
                fs.copyFileSync(sourceIconPath, iconPath);
            }

            if (process.platform === 'win32') {
                const programsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
                shortcutPath = path.join(programsPath, `${appName}.lnk`);
                const targetPath = execPath;
                const arguments = '--no-sandbox --app-id=' + uid;

                // 确保目录存在
                if (!fs.existsSync(programsPath)) {
                    fs.mkdirSync(programsPath, { recursive: true });
                }

                // 使用转义后的路径创建快捷方式，确保图标路径正确
                command = `powershell -Command `
                    + `"$ws = New-Object -ComObject WScript.Shell; `
                    + `$s = $ws.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}'); `
                    + `$s.TargetPath = '${targetPath.replace(/\\/g, '\\\\')}'; `
                    + `$s.Arguments = '${arguments}'; `
                    + `$s.IconLocation = '${iconPath.replace(/\\/g, '\\\\')},0'; `
                    + `$s.Save()"`;
                execSync(command);
            } else if (process.platform === 'darwin') {
                shortcutPath = path.join('/Applications', `${appName}.app`);
                const targetPath = `"${execPath}" --no-sandbox --app-id=${uid}`;
                command = `osascript -e 'tell application "Finder" to make alias file to POSIX file "${targetPath}" at POSIX file "/Applications"'`;
                execSync(command);
            } else if (process.platform === 'linux') {
                const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
                if (!fs.existsSync(applicationsPath)) {
                    fs.mkdirSync(applicationsPath, { recursive: true });
                }
                shortcutPath = path.join(applicationsPath, `${appName}.desktop`);

                const desktopFile = `[Desktop Entry]
Name=${appName}
Comment=${appItem.description || ''}
Exec="${execPath}" --no-sandbox --app-id=${uid} --class=canbox-app-${uid} --wm-class=canbox-app-${uid} --wm_class=canbox-app-${uid} --app-name=${appItem.name || uid}
Icon=${iconPath}
Type=Application
StartupWMClass=${uid}
`;
                fs.writeFileSync(shortcutPath, desktopFile);
            }
        }
        return { success: true };
    } catch (error) {
        logger.error('生成快捷方式失败 / Failed to generate shortcuts:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 删除应用快捷方式
 * @param {Object} appsData - 所有应用
 * @returns {Object} - 操作结果
 */
function deleteShortcuts(appsData) {
    if (!appsData || Object.keys(appsData).length === 0) {
        return handleError('应用信息为空', 'deleteShortcuts');
    }

    try {
        Object.entries(appsData).forEach(([uid, appItem]) => {
            const hasNonAscii = /[^\x00-\x7F]/.test(appItem.name || '');
            const appName = (appItem.alias && hasNonAscii)
                ? `canbox-${appItem.name} (${appItem.alias})`
                : 'canbox-' + appItem.name;
            let shortcutPath;

            if (process.platform === 'win32') {
                const programsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
                shortcutPath = path.join(programsPath, `${appName}.lnk`);
            } else if (process.platform === 'darwin') {
                shortcutPath = path.join('/Applications', `${appName}.app`);
            } else if (process.platform === 'linux') {
                shortcutPath = path.join(os.homedir(), '.local', 'share', 'applications', `${appName}.desktop`);
            }

            if (fs.existsSync(shortcutPath)) {
                fs.unlinkSync(shortcutPath);
            }
            
            // 删除缓存的图标文件
            const iconExt = path.extname(appItem.logo).toLowerCase();
            // 删除可能的图标文件格式（ICO 或原始格式）
            const possibleIconExts = process.platform === 'win32'
                ? ['.ico', iconExt]
                : [iconExt];

            for (const ext of possibleIconExts) {
                const iconPath = path.join(getAppIconPath(), `${uid}${ext}`);
                if (fs.existsSync(iconPath)) {
                        try {
                            fs.unlinkSync(iconPath);
                            logger.info(`删除图标文件 / Deleting icon file: ${iconPath}`);
                        } catch (error) {
                            logger.error(`删除图标文件失败 / Failed to delete icon file ${iconPath}:`, error);
                        }
                }
            }
        });
        return { success: true };
    } catch (error) {
        logger.error('删除快捷方式失败 / Failed to delete shortcuts:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 是否需要重新生成快捷方式
 * 
 * @returns {boolean} - true：需要，false：不需要
 */
const needRegenerateShortcuts = () => {

    // 检查是否存在 canbox-*.desktop 文件
    if (process.platform === 'linux') {
        const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
        if (fs.existsSync(applicationsPath)) {
            const files = fs.readdirSync(applicationsPath);
            const hasDesktopFile = files.some(file => file.startsWith('canbox-') && file.endsWith('.desktop'));
            if (hasDesktopFile) {
                return true;
            }
        }
    }

    return false;
};

const markVersion = (currentVersion) => {
    getCanboxStore().set('version', currentVersion);
};

/**
 * 初始化快捷方式和 desktop 文件（异步）
 * @param {string} currentVersion - 当前版本号
 * @param {Object} appsData - 应用数据
 * @returns {Promise<Object>} - 操作结果
 */
async function initShortcuts(currentVersion, appsData) {
    // 存储的版本
    const savedVersion = getCanboxStore().get('version');
    // if (savedVersion === currentVersion) {
    //     return { success: true, msg: '不需要更新shortcuts' };
    // }
    // 版本差异标识，true-版本有差异，false-版本无差异
    let versionDiffFlag = savedVersion !== currentVersion;
    try {

        // 初始化应用快捷方式
        if (versionDiffFlag && needRegenerateShortcuts(currentVersion) && appsData) {
            const result = await generateShortcuts(appsData);
        }

        // 初始化 Canbox desktop 文件（Linux AppImage）
        if (process.platform === 'linux' && process.env.APPIMAGE) {
            if (versionDiffFlag || needGenerateCanboxDesktop()) {
                createCanboxDesktop();
            }
        }

        // 更新存储的版本号标记
        markVersion(currentVersion);

        return { success: true, msg: '不需要更新shortcuts' };
    } catch (error) {
        return handleError(new Error('初始化快捷方式失败' + error.message), 'initShortcuts');
    }
}

/**
 * 创建 Canbox 主程序的 desktop 文件（Linux AppImage）
 * 该文件会出现在系统应用菜单中，方便启动 Canbox
 */
function createCanboxDesktop() {
    const appImagePath = process.env.APPIMAGE;
    if (!appImagePath) {
        logger.warn('[shortcutManager.js] 未检测到 AppImage 环境，跳过创建 desktop 文件 / AppImage environment not detected, skipping desktop file creation');
        return;
    }

    const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
    const desktopFilePath = path.join(applicationsPath, 'canbox.desktop');

    // 确保 applications 目录存在
    if (!fs.existsSync(applicationsPath)) {
        fs.mkdirSync(applicationsPath, { recursive: true });
    }

    logger.info('[shortcutManager.js] appImagePath: {}', appImagePath);

    // 获取 AppImage 所在目录和文件名
    const appImageDir = path.dirname(appImagePath);
    const iconFileName = 'canbox.png';
    const externalIconPath = path.join(appImageDir, iconFileName);

    // 尝试从 AppImage 包内复制图标到外部
    const internalIconPath1 = path.join(__dirname, '..', '..', 'logo_256x256.png');
    const internalIconPath2 = path.join(__dirname, '..', '..', 'logo.png');
    const internalIconPath = fs.existsSync(internalIconPath1) ? internalIconPath1 : internalIconPath2;

    if (fs.existsSync(internalIconPath)) {
        try {
            // 将图标复制到 AppImage 文件旁边
            fs.copyFileSync(internalIconPath, externalIconPath);
            logger.info(`图标复制成功 / Icon copied successfully: ${internalIconPath} -> ${externalIconPath}`);
        } catch (error) {
            logger.warn('图标复制失败，使用原始路径 / Failed to copy icon, using original path:', error);
        }
    }

    // 确定最终使用的图标路径
    const finalIconPath = fs.existsSync(externalIconPath) ? externalIconPath : internalIconPath;

    // 创建 desktop 文件内容
    const desktopContent = `[Desktop Entry]
Name=Canbox
Comment=Canbox - 应用集合平台
Exec="${appImagePath}" --no-sandbox %U
Icon=${finalIconPath}
Type=Application
Categories=Utility;Development;
Terminal=false
StartupNotify=true
StartupWMClass=canbox
`;

    // 写入 desktop 文件
    fs.writeFileSync(desktopFilePath, desktopContent);
    logger.info(`Canbox desktop 文件创建成功 (AppImage) / Canbox desktop file created successfully (AppImage): ${desktopFilePath}`);

    // 设置执行权限
    try {
        fs.chmodSync(desktopFilePath, 0o755);
    } catch (error) {
        logger.warn('设置 desktop 文件权限失败 / Failed to set desktop file permissions:', error);
    }
}

/**
 * 检查是否需要生成Canbox桌面文件
 * @returns {boolean} 是否需要生成桌面文件
 */
function needGenerateCanboxDesktop() {
    const desktopPath = path.join(os.homedir(), '.local', 'share', 'applications', 'canbox.desktop');
    return !fs.existsSync(desktopPath);
}

module.exports = {
    generateShortcuts,
    deleteShortcuts,
    initShortcuts
};