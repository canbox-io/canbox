/**
 * APP 窗口缩放功能
 *
 * 为 APP 窗口提供 Ctrl+鼠标滚轮 和 Ctrl++/Ctrl+-/Ctrl+0 缩放能力。
 * 通过注入自包含脚本实现，零 IPC 依赖，适用于 webapp 和普通 APP。
 *
 * 缩放结果持久化到 winState，下次启动自动恢复：
 * - 运行时每 3 秒轮询 window.__canboxCurrentZoom，变更时写入 winState
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
        const zoomScript = `
            (function() {
                if (window.__canboxZoomInjected) return;
                window.__canboxZoomInjected = true;

                var currentZoom = ${initialZoom};
                var STEP = 0.1;
                var MIN = 0.5;
                var MAX = 2.0;

                function applyZoom(z) {
                    document.body.style.zoom = z;
                    window.__canboxCurrentZoom = z;
                }

                function adjustZoom(delta) {
                    var newZoom = currentZoom + delta;
                    newZoom = Math.max(MIN, Math.min(MAX, newZoom));
                    newZoom = Math.round(newZoom * 10) / 10;
                    if (newZoom !== currentZoom) {
                        currentZoom = newZoom;
                        applyZoom(currentZoom);
                    }
                }

                function resetZoom() {
                    if (currentZoom !== 1.0) {
                        currentZoom = 1.0;
                        applyZoom(1.0);
                    }
                }

                // 初始应用 zoom（恢复上次退出时的值）
                applyZoom(currentZoom);

                // Ctrl + 鼠标滚轮
                document.addEventListener('wheel', function(e) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        var delta = e.deltaY > 0 ? -STEP : STEP;
                        adjustZoom(delta);
                    }
                }, { passive: false });

                // 键盘快捷键
                document.addEventListener('keydown', function(e) {
                    if (!e.ctrlKey) return;
                    // Ctrl++ / Ctrl+=
                    if (e.key === '+' || e.key === '=') {
                        e.preventDefault();
                        adjustZoom(STEP);
                    }
                    // Ctrl+-
                    else if (e.key === '-' || e.key === '_') {
                        e.preventDefault();
                        adjustZoom(-STEP);
                    }
                    // Ctrl+0 → 重置
                    else if (e.key === '0') {
                        e.preventDefault();
                        resetZoom();
                    }
                });

                console.log('[Canbox Zoom] Zoom initialized (Ctrl+Wheel / Ctrl++/-/0), initial: ' + ${initialZoom});
            })();
        `;

        appWin.webContents.executeJavaScript(zoomScript).catch(err => {
            logger.error('[app-zoom] Failed to inject zoom script:', err);
        });
    });
}

/**
 * 读取注入脚本中的当前 zoom 值
 * @param {BrowserWindow} appWin - APP 窗口实例
 * @returns {Promise<number|undefined>} 当前 zoom 因子
 */
function getCurrentZoom(appWin) {
    if (!appWin || appWin.isDestroyed()) {
        return Promise.resolve();
    }
    return appWin.webContents.executeJavaScript('window.__canboxCurrentZoom');
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

    const intervalId = setInterval(async () => {
        if (disposed || appWin.isDestroyed()) {
            clearInterval(intervalId);
            return;
        }
        try {
            const zoom = await getCurrentZoom(appWin);
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
