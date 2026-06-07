const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('@modules/utils/logger');

/**
 * 解析 .desktop 文件
 * @param {string} filePath - .desktop 文件路径
 * @returns {Object|null} 应用信息
 */
function parseDesktopFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        const app = {
            id: path.basename(filePath, '.desktop'),
            name: '',
            exec: '',
            icon: '',
            comment: '',
            source: 'system',
            desktopPath: filePath
        };

        let inDesktopEntry = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === '[Desktop Entry]') {
                inDesktopEntry = true;
                continue;
            }

            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                // 只解析 [Desktop Entry] section
                break;
            }

            if (!inDesktopEntry) continue;

            if (trimmed.startsWith('Name=')) {
                app.name = trimmed.substring(5);
            } else if (trimmed.startsWith('Exec=')) {
                app.exec = trimmed.substring(5);
            } else if (trimmed.startsWith('Icon=')) {
                app.icon = trimmed.substring(5);
            } else if (trimmed.startsWith('Comment=')) {
                app.comment = trimmed.substring(8);
            } else if (trimmed.startsWith('NoDisplay=')) {
                if (trimmed.substring(10).toLowerCase() === 'true') {
                    return null;
                }
            } else if (trimmed.startsWith('Hidden=')) {
                if (trimmed.substring(7).toLowerCase() === 'true') {
                    return null;
                }
            } else if (trimmed.startsWith('Terminal=')) {
                // Terminal 应用暂不排除，用户可能需要
            }
        }

        // 跳过没有名称或没有执行命令的应用
        if (!app.name || !app.exec) {
            return null;
        }

        // 清理 Exec 字段中的占位符
        app.exec = cleanupExecCommand(app.exec);

        // 尝试解析图标路径
        app.iconPath = resolveIconPath(app.icon);

        // Flatpak 应用回退：图标通常不在 exports 目录，而在 app 安装目录内
        if (!app.iconPath && isFlatpakDesktopFile(filePath)) {
            const appId = extractFlatpakAppId(filePath);
            if (appId) {
                app.iconPath = findFlatpakIcon(appId, app.icon);
            }
        }

        return app;
    } catch (error) {
        logger.error('[SystemAppReader] 解析 .desktop 文件失败: {} - {}', filePath, error.message);
        return null;
    }
}

/**
 * 清理 Exec 命令中的 .desktop 占位符
 * 常见占位符: %f, %F, %u, %U, %i, %c, %k
 */
function cleanupExecCommand(exec) {
    return exec
        .replace(/%[fFuUdDnNickvm]/g, '')
        .replace(/%%/g, '%')
        .trim();
}

/**
 * 解析图标路径
 * 图标字段可能是: 绝对路径、图标名（需要在图标主题中查找）
 */
function resolveIconPath(iconName) {
    if (!iconName) return null;

    // 如果已经是绝对路径，直接返回
    if (path.isAbsolute(iconName)) {
        if (fs.existsSync(iconName)) return iconName;
        // 尝试添加常见扩展名
        for (const ext of ['.png', '.svg', '.xpm', '.ico']) {
            const withExt = iconName + ext;
            if (fs.existsSync(withExt)) return withExt;
        }
        return null;
    }

    // 图标名：在常见图标目录中搜索
    const searchDirs = [
        // 用户级图标
        path.join(os.homedir(), '.local/share/icons'),
        path.join(os.homedir(), '.icons'),
        // Flatpak 图标（用户级）
        path.join(os.homedir(), '.local/share/flatpak/exports/share/icons'),
        // 系统级图标
        '/usr/share/icons',
        '/usr/share/pixmaps',
        // Flatpak 图标（系统级）
        '/var/lib/flatpak/exports/share/icons'
    ];

    const extensions = ['.png', '.svg', '.xpm', '.ico', ''];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;

        // 递归搜索图标目录（限制深度以避免过慢，需至少 4 层以兼容 hicolor/48x48/apps/ 结构）
        const found = findIconInDir(dir, iconName, extensions, 5);
        if (found) return found;
    }

    return null;
}

/**
 * 在目录中递归查找图标文件
 */
function findIconInDir(dir, iconName, extensions, maxDepth) {
    if (maxDepth <= 0) return null;

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                const found = findIconInDir(fullPath, iconName, extensions, maxDepth - 1);
                if (found) return found;
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                const baseName = path.basename(entry.name, ext);
                if (baseName === iconName && extensions.includes(ext)) {
                    return fullPath;
                }
            }
        }
    } catch (e) {
        // 跳过无法读取的目录
    }

    return null;
}

/**
 * 判断 desktop 文件是否来自 Flatpak 目录
 * @param {string} filePath - .desktop 文件路径
 * @returns {boolean}
 */
function isFlatpakDesktopFile(filePath) {
    return filePath.includes('/flatpak/');
}

/**
 * 从 Flatpak desktop 文件路径中提取应用 ID
 * Flatpak 规范规定 .desktop 文件名必须是应用 ID
 * @param {string} filePath - .desktop 文件路径
 * @returns {string} 应用 ID（如 com.tencent.WeChat）
 */
function extractFlatpakAppId(filePath) {
    return path.basename(filePath, '.desktop');
}

/**
 * 在 Flatpak 应用安装目录中搜索图标
 * Flatpak 图标路径: {flatpakBase}/app/{appId}/.../icons/hicolor/{size}/apps/{iconName}.png
 * @param {string} appId - Flatpak 应用 ID
 * @param {string} iconName - 图标名称
 * @returns {string|null} 图标文件路径
 */
function findFlatpakIcon(appId, iconName) {
    const flatpakBases = [
        path.join(os.homedir(), '.local/share/flatpak/app'),
        '/var/lib/flatpak/app'
    ];

    for (const base of flatpakBases) {
        const appDir = path.join(base, appId);
        if (!fs.existsSync(appDir)) continue;

        // 在 app 目录内递归搜索，限制深度避免过慢
        // 路径深度: appId/x86_64/stable/{hash}/files|export/share/icons/hicolor/{size}/apps/{icon}.png
        // 约需 8-9 层
        const found = findIconInDir(appDir, iconName, ['.png', '.svg', '.xpm', '.ico'], 10);
        if (found) return found;
    }

    return null;
}

/**
 * 获取系统应用列表
 * @returns {Array} 应用列表
 */
function getSystemApplications() {
    const apps = [];
    const seenIds = new Set();

    // Linux 系统应用目录（用户级优先，可覆盖系统级）
    const dirs = [
        path.join(os.homedir(), '.local/share/applications'),
        '/usr/share/applications',
        '/var/lib/flatpak/exports/share/applications',
        path.join(os.homedir(), '.local/share/flatpak/exports/share/applications')
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;

        let files;
        try {
            files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop'));
        } catch (e) {
            logger.warn('[SystemAppReader] 无法读取目录: {}', dir);
            continue;
        }

        for (const file of files) {
            const filePath = path.join(dir, file);
            const app = parseDesktopFile(filePath);

            if (app && !seenIds.has(app.id)) {
                seenIds.add(app.id);
                // 记录来源目录，用于去重优先级
                app._sourceDir = dir;
                apps.push(app);
            }
        }
    }

    logger.info('[SystemAppReader] 读取到 {} 个系统应用', apps.length);
    return apps;
}

module.exports = {
    getSystemApplications,
    parseDesktopFile
};
