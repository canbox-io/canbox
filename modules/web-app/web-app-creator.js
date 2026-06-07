const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs');
const { v4: uuidv4 } = require('uuid');
const asar = require('asar');
const logger = require('@modules/utils/logger');
const { getAppPath } = require('@modules/main/pathManager');
const { getAppsStore } = require('@modules/main/storageManager');
const { downloadIcon } = require('./website-scraper');

const DEFAULT_ICON_PATH = path.join(__dirname, 'default-icon.png');

function extractAliasFromUrl(urlStr) {
    try {
        const parsed = new URL(urlStr);
        let hostname = parsed.hostname || '';
        hostname = hostname.replace(/^www\./i, '');
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts[0];
        }
        return hostname.replace(/\./g, '-');
    } catch (e) {
        return '';
    }
}

async function createWebApp(options) {
    const { url, name, iconPath, showNavbar, alias } = options;

    if (!url) {
        return { success: false, error: 'URL is required' };
    }
    if (!name) {
        return { success: false, error: 'Name is required' };
    }

    const uid = uuidv4().replace(/-/g, '');
    const appId = 'com.canbox.webapp.' + uid.substring(0, 8);

    const appAlias = alias || extractAliasFromUrl(url);

    const appJson = {
        id: appId,
        name: name,
        alias: appAlias,
        version: '1.0.0',
        description: 'Web App: ' + url,
        author: '',
        logo: 'logo.png',
        main: url,
        type: 'webapp',
        webappOptions: {
            showNavbar: !!showNavbar
        },
        window: {
            width: 1280,
            height: 800,
            minWidth: 800,
            minHeight: 600
        }
    };

    try {
        const appDir = getAppPath();
        if (!fs.existsSync(appDir)) {
            fs.mkdirSync(appDir, { recursive: true });
        }

        const tmpDir = path.join(appDir, 'tmp-' + uid);
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(tmpDir, 'app.json'),
            JSON.stringify(appJson, null, 4),
            'utf8'
        );

        const logoDestPath = path.join(tmpDir, 'logo.png');
        if (iconPath && fs.existsSync(iconPath)) {
            const iconData = fs.readFileSync(iconPath);
            fs.writeFileSync(logoDestPath, iconData);
        } else if (fs.existsSync(DEFAULT_ICON_PATH)) {
            const defaultData = fs.readFileSync(DEFAULT_ICON_PATH);
            fs.writeFileSync(logoDestPath, defaultData);
        } else {
            const pngBuffer = generateDefaultIcon();
            fs.writeFileSync(logoDestPath, pngBuffer);
        }

        const asarPath = path.join(appDir, uid + '.asar');
        await asar.createPackage(tmpDir, asarPath);

        originalFs.rmSync(tmpDir, { recursive: true, force: true });

        const logoExt = path.extname(appJson.logo).toLowerCase();
        const targetLogoPath = path.join(appDir, uid + logoExt);
        try {
            const logoData = fs.readFileSync(path.join(asarPath, appJson.logo));
            fs.writeFileSync(targetLogoPath, logoData);
            logger.info('WebApp logo copied to: {}', targetLogoPath);

            if (process.platform === 'win32') {
                const sharp = getSharp();
                if (sharp) {
                    const icoPath = path.join(appDir, uid + '.ico');
                    await convertToIco(targetLogoPath, icoPath);
                }
            }
        } catch (err) {
            logger.warn('WebApp logo copy failed: {}', err.message);
        }

        let appsConfig = getAppsStore().get('default') || {};
        appsConfig[uid] = {
            id: appJson.id,
            name: appJson.name,
            alias: appAlias,
            version: appJson.version,
            description: appJson.description,
            author: appJson.author,
            logo: appJson.logo,
            sourceTag: 'webapp'
        };
        getAppsStore().set('default', appsConfig);

        logger.info('WebApp created successfully: {} ({})', name, uid);

        // 创建完成后自动生成快捷方式
        try {
            const { generateShortcuts } = require('@modules/main/shortcutManager');
            const { getAllApps } = require('@modules/main/appManager');
            const appsData = getAllApps().data || {};
            generateShortcuts(appsData).then(result => {
                if (result.success) {
                    logger.info('[createWebApp] 快捷方式已自动生成');
                } else {
                    logger.warn('[createWebApp] 快捷方式生成失败: {}', result.msg);
                }
            }).catch(err => {
                logger.error('[createWebApp] 快捷方式生成异常: {}', err.message);
            });
        } catch (shortcutError) {
            logger.error('[createWebApp] 快捷方式生成失败: {}', shortcutError.message);
        }

        return { success: true, uid: uid, appId: appId };
    } catch (error) {
        logger.error('WebApp creation failed: {}', error.message);
        return { success: false, error: error.message };
    }
}

function generateDefaultIcon() {
    const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    const width = 64;
    const height = 64;

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;
    ihdrData[9] = 6;
    ihdrData[10] = 0;
    ihdrData[11] = 0;
    ihdrData[12] = 0;
    const ihdr = makeChunk('IHDR', ihdrData);

    const rawData = [];
    for (let y = 0; y < height; y++) {
        rawData.push(0);
        for (let x = 0; x < width; x++) {
            const cx = x - width / 2;
            const cy = y - height / 2;
            const dist = Math.sqrt(cx * cx + cy * cy);
            const radius = width / 2 - 4;
            if (dist <= radius) {
                rawData.push(66, 133, 244, 255);
            } else {
                rawData.push(0, 0, 0, 0);
            }
        }
    }

    const zlib = require('zlib');
    const compressed = zlib.deflateSync(Buffer.from(rawData));
    const idat = makeChunk('IDAT', compressed);

    const iend = makeChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([PNG_SIGNATURE, ihdr, idat, iend]);
}

function makeChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);

    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);

    return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xEDB88320;
            } else {
                crc = crc >>> 1;
            }
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

let sharpCache = null;

function getSharp() {
    if (process.platform !== 'win32') return null;
    if (sharpCache === null) {
        try {
            sharpCache = require('sharp');
        } catch (e) {
            sharpCache = false;
        }
    }
    return sharpCache || null;
}

async function convertToIco(inputPath, outputPath) {
    const sharp = getSharp();
    if (!sharp) return false;

    try {
        const tempPng = outputPath.replace('.ico', '.temp.png');
        await sharp(inputPath)
            .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toFile(tempPng);

        const pngData = fs.readFileSync(tempPng);
        const header = Buffer.alloc(6);
        header.writeUInt16LE(0, 0);
        header.writeUInt16LE(1, 2);
        header.writeUInt16LE(1, 4);

        const dirEntry = Buffer.alloc(16);
        dirEntry.writeUInt8(0, 0);
        dirEntry.writeUInt8(0, 1);
        dirEntry.writeUInt8(0, 2);
        dirEntry.writeUInt8(0, 3);
        dirEntry.writeUInt16LE(1, 4);
        dirEntry.writeUInt16LE(32, 6);
        dirEntry.writeUInt32LE(pngData.length, 8);
        dirEntry.writeUInt32LE(22, 12);

        const icoData = Buffer.concat([header, dirEntry, pngData]);
        fs.writeFileSync(outputPath, icoData);

        if (fs.existsSync(tempPng)) fs.unlinkSync(tempPng);
        return true;
    } catch (e) {
        logger.warn('WebApp ICO conversion failed: {}', e.message);
        return false;
    }
}

module.exports = {
    createWebApp
};
