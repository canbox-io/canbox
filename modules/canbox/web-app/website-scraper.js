const https = require('https');
const http = require('http');
const { URL } = require('url');
const { BrowserWindow } = require('electron');
const logger = require('@modules/utils/logger');

const FETCH_TIMEOUT = 10000;
const BROWSER_WINDOW_TIMEOUT = 15000;

function fetchWebsiteInfo(urlStr) {
    return new Promise(async (resolve) => {
        const result = { title: '', faviconUrl: '', url: urlStr };

        try {
            new URL(urlStr);
        } catch (e) {
            resolve(result);
            return;
        }

        try {
            const httpResult = await fetchViaHttp(urlStr);
            if (httpResult.title || httpResult.faviconUrl) {
                result.title = httpResult.title;
                result.faviconUrl = httpResult.faviconUrl;
                resolve(result);
                return;
            }
        } catch (e) {
            logger.info('website-scraper: HTTP fetch failed, trying BrowserWindow fallback: {}', e.message);
        }

        try {
            const bwResult = await fetchViaBrowserWindow(urlStr);
            result.title = bwResult.title || result.title;
            result.faviconUrl = bwResult.faviconUrl || result.faviconUrl;
        } catch (e) {
            logger.warn('website-scraper: BrowserWindow fetch also failed: {}', e.message);
        }

        resolve(result);
    });
}

function fetchViaHttp(urlStr) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(urlStr);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
            },
            timeout: FETCH_TIMEOUT
        };

        const req = client.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                try {
                    const redirectUrl = new URL(res.headers.location, urlStr).href;
                    fetchViaHttp(redirectUrl).then(resolve).catch(reject);
                } catch (e) {
                    reject(new Error('Invalid redirect URL'));
                }
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error('HTTP status: ' + res.statusCode));
                return;
            }

            const contentType = res.headers['content-type'] || '';
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
                reject(new Error('Not HTML content: ' + contentType));
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const info = parseHtmlMeta(data, urlStr);
                    resolve(info);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
}

function parseHtmlMeta(html, baseUrl) {
    const result = { title: '', faviconUrl: '' };

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        result.title = decodeHtmlEntities(titleMatch[1].trim());
    }

    const iconPatterns = [
        /<link[^>]+rel\s*=\s*["']apple-touch-icon["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i,
        /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']apple-touch-icon["'][^>]*>/i,
        /<link[^>]+rel\s*=\s*["']icon["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i,
        /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']icon["'][^>]*>/i,
        /<link[^>]+rel\s*=\s*["']shortcut icon["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i,
        /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']shortcut icon["'][^>]*>/i,
        /<link[^>]+rel\s*=\s*["']alternate icon["'][^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i,
        /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']alternate icon["'][^>]*>/i,
        /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["'][^>]*>/i
    ];

    for (const pattern of iconPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
            result.faviconUrl = resolveUrl(match[1], baseUrl);
            break;
        }
    }

    if (!result.faviconUrl) {
        const parsedBase = new URL(baseUrl);
        result.faviconUrl = parsedBase.origin + '/favicon.ico';
    }

    return result;
}

function fetchViaBrowserWindow(urlStr) {
    return new Promise((resolve, reject) => {
        let win = null;
        let settled = false;

        const cleanup = () => {
            if (win && !win.isDestroyed()) {
                try { win.close(); } catch (e) { /* ignore */ }
            }
            win = null;
        };

        const settle = (result) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };

        const fail = (error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        };

        try {
            win = new BrowserWindow({
                width: 800,
                height: 600,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true,
                    webSecurity: true
                }
            });

            const timer = setTimeout(() => {
                fail(new Error('BrowserWindow fetch timeout'));
            }, BROWSER_WINDOW_TIMEOUT);

            win.webContents.on('did-finish-load', () => {
                clearTimeout(timer);

                win.webContents.executeJavaScript(`
                    (function() {
                        var title = document.title || '';
                        var faviconUrl = '';
                        var selectors = [
                            'link[rel="apple-touch-icon"]',
                            'link[rel="icon"]',
                            'link[rel="shortcut icon"]',
                            'link[rel="alternate icon"]'
                        ];
                        for (var i = 0; i < selectors.length; i++) {
                            var el = document.querySelector(selectors[i]);
                            if (el && el.href) {
                                faviconUrl = el.href;
                                break;
                            }
                        }
                        if (!faviconUrl) {
                            var ogImage = document.querySelector('meta[property="og:image"]');
                            if (ogImage && ogImage.content) {
                                faviconUrl = ogImage.content;
                            }
                        }
                        if (!faviconUrl) {
                            faviconUrl = window.location.origin + '/favicon.ico';
                        }
                        return { title: title, faviconUrl: faviconUrl };
                    })();
                `).then((info) => {
                    settle({
                        title: info.title || '',
                        faviconUrl: info.faviconUrl || ''
                    });
                }).catch((e) => {
                    fail(e);
                });
            });

            win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
                clearTimeout(timer);
                fail(new Error('Page load failed: ' + errorDescription));
            });

            win.loadURL(urlStr);
        } catch (e) {
            fail(e);
        }
    });
}

async function downloadIcon(urlStr, destPath) {
    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(urlStr);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            client.get(urlStr, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: FETCH_TIMEOUT
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location, urlStr).href;
                    downloadIcon(redirectUrl, destPath).then(resolve);
                    return;
                }

                if (res.statusCode !== 200) {
                    resolve({ success: false, error: 'HTTP status: ' + res.statusCode });
                    return;
                }

                const chunks = [];
                res.on('data', (chunk) => { chunks.push(chunk); });
                res.on('end', () => {
                    try {
                        const fs = require('fs');
                        const dir = require('path').dirname(destPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFileSync(destPath, Buffer.concat(chunks));
                        resolve({ success: true, path: destPath });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            }).on('error', (e) => {
                resolve({ success: false, error: e.message });
            }).on('timeout', function () {
                this.destroy();
                resolve({ success: false, error: 'Download timeout' });
            });
        } catch (e) {
            resolve({ success: false, error: e.message });
        }
    });
}

function resolveUrl(href, baseUrl) {
    try {
        return new URL(href, baseUrl).href;
    } catch (e) {
        return href;
    }
}

function decodeHtmlEntities(text) {
    const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&nbsp;': ' '
    };
    return text.replace(/&[a-z]+;|&#\d+;/gi, (match) => entities[match] || match);
}

module.exports = {
    fetchWebsiteInfo,
    downloadIcon
};
