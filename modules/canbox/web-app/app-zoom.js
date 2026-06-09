/**
 * APP 窗口缩放功能
 *
 * 为 APP 窗口提供 Ctrl+鼠标滚轮 和 Ctrl++/Ctrl+-/Ctrl+0 缩放能力。
 * 通过 app.preload.js preload 中 contextBridge.exposeInMainWorld 暴露的
 * window.__canboxZoom.setZoomFactor / getZoomFactor
 * 调用 webFrame.setZoomFactor() 实现原生 viewport 缩放，
 * 行为与浏览器 Ctrl++ 缩放一致，会触发页面重排，fixed/sticky 定位正确跟随。
 *
 * 缩放结果持久化到 winState，下次启动自动恢复：
 * - 运行时每 3 秒轮询 getZoomFactor()，变更时写入 winState
 * - 退出时使用最后一次已知值同步保存
 *
 * 缩放参数与 Canbox 主窗口一致：
 * - 步进: 0.1
 * - 范围: 0.5 ~ 2.0
 * - Ctrl+0: 重置到 1.0
 */

const logger = require('@modules/utils/logger');

/**
 * 为 APP 窗口设置缩放功能
 * @param {BrowserWindow} appWin - APP 窗口实例
 * @param {boolean} enableZoom - 是否启用缩放，默认 true
 * @param {number} savedZoomFactor - 持久化的缩放因子，默认 1.0
 */
function setupAppZoom(appWin, enableZoom = true, savedZoomFactor = 1.0) {
    if (!enableZoom || !appWin || appWin.isDestroyed()) {
        return;
    }

    const initialZoom = savedZoomFactor || 1.0;

    appWin.webContents.on('did-finish-load', () => {
        // 设置初始缩放（恢复上次退出时的值，导航后重新应用）
        try {
            appWin.webContents.setZoomFactor(initialZoom);
            logger.info('[app-zoom] Zoom set to: {}', initialZoom);
        } catch (err) {
            logger.error('[app-zoom] Failed to set zoom factor:', err);
        }

        // 注入缩放交互脚本
        const zoomScript = `
            (function() {
                var STEP = 0.1;
                var MIN = 0.5;
                var MAX = 2.0;

                // 移除旧监听器（防止 did-finish-load 重复注入时叠加）
                if (window.__canboxZoomWheelHandler) {
                    document.removeEventListener('wheel', window.__canboxZoomWheelHandler);
                }
                if (window.__canboxZoomKeyHandler) {
                    document.removeEventListener('keydown', window.__canboxZoomKeyHandler);
                }

                function adjustZoom(delta) {
                    var current = window.__canboxZoom.getZoomFactor();
                    var newZoom = current + delta;
                    newZoom = Math.max(MIN, Math.min(MAX, newZoom));
                    newZoom = Math.round(newZoom * 10) / 10;
                    if (newZoom !== current) {
                        window.__canboxZoom.setZoomFactor(newZoom);
                    }
                }

                // Ctrl + 鼠标滚轮
                window.__canboxZoomWheelHandler = function(e) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        var delta = e.deltaY > 0 ? -STEP : STEP;
                        adjustZoom(delta);
                    }
                };
                document.addEventListener('wheel', window.__canboxZoomWheelHandler, { passive: false });

                // 键盘快捷键
                window.__canboxZoomKeyHandler = function(e) {
                    if (!e.ctrlKey) return;
                    if (e.key === '+' || e.key === '=') {
                        e.preventDefault();
                        adjustZoom(STEP);
                    } else if (e.key === '-' || e.key === '_') {
                        e.preventDefault();
                        adjustZoom(-STEP);
                    } else if (e.key === '0') {
                        e.preventDefault();
                        var current = window.__canboxZoom.getZoomFactor();
                        if (current !== 1.0) {
                            window.__canboxZoom.setZoomFactor(1.0);
                        }
                    }
                };
                document.addEventListener('keydown', window.__canboxZoomKeyHandler);

                console.log('[Canbox Zoom] Zoom initialized (Ctrl+Wheel / Ctrl++/-/0), initial: ${initialZoom}');
            })();
        `;

        appWin.webContents.executeJavaScript(zoomScript).catch(err => {
            logger.error('[app-zoom] Failed to inject zoom script:', err);
        });
    });
}

/**
 * 读取当前 zoom 值
 * @param {BrowserWindow} appWin - APP 窗口实例
 * @returns {Promise<number|undefined>} 当前 zoom 因子
 */
function getCurrentZoom(appWin) {
    if (!appWin || appWin.isDestroyed()) {
        return Promise.resolve();
    }
    try {
        const factor = appWin.webContents.getZoomFactor();
        return Promise.resolve(factor);
    } catch (e) {
        return Promise.resolve();
    }
}

/**
 * 启动 zoom 持久化：定期轮询并保存 zoom 变化到 winState
 * 返回控制器对象，调用 stop() 停止轮询，getLastKnownZoom() 获取最后已知值
 *
 * @param {BrowserWindow} appWin - APP 窗口实例
 * @param {string} uid - APP ID
 * @param {object} winState - winState 单例
 * @param {number} initialZoom - 初始 zoom 因子
 * @returns {{ stop: Function, getLastKnownZoom: Function }}
 */
function startZoomPersistence(appWin, uid, winState, initialZoom = 1.0) {
    let currentZoom = initialZoom;
    let disposed = false;

    const intervalId = setInterval(() => {
        if (disposed || appWin.isDestroyed()) {
            clearInterval(intervalId);
            return;
        }
        try {
            const zoom = appWin.webContents.getZoomFactor();
            if (typeof zoom === 'number' && Math.abs(zoom - currentZoom) > 0.01) {
                currentZoom = zoom;
                const state = winState.loadSync(uid) || {};
                state.zoomFactor = zoom;
                winState.save(uid, state, () => {});
            }
        } catch (e) {
            // 页面可能在导航/卸载中，忽略本次轮询
        }
    }, 3000);

    return {
        stop: () => {
            disposed = true;
            clearInterval(intervalId);
        },
        getLastKnownZoom: () => currentZoom
    };
}

module.exports = {
    setupAppZoom,
    getCurrentZoom,
    startZoomPersistence
};
