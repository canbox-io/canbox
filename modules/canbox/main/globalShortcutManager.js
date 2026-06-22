const { globalShortcut, BrowserWindow } = require('electron');
const { getCanboxStore, getAppsDevStore } = require('@modules/canbox/main/storageManager');
const logger = require('@modules/utils/logger');

/**
 * 全局快捷键管理器（单例）
 * 负责与 Electron globalShortcut 模块交互，维护 accelerator → appId 的持久化映射。
 *
 * 设计原则：
 * - 映射持久化到 canbox.json（globalShortcuts 字段），callback 不持久化
 * - APP 每次启动只需监听 onTriggered 事件，无需重复注册 callback
 * - 两种触发模式：focus（聚焦窗口）和 callback（IPC 事件通知）
 * - Canbox 退出时全局注销所有快捷键（Electron 推荐做法）
 */
class GlobalShortcutManager {
    static instance = null;

    /**
     * 获取单例实例
     * @returns {GlobalShortcutManager}
     */
    static getInstance() {
        if (!GlobalShortcutManager.instance) {
            GlobalShortcutManager.instance = new GlobalShortcutManager();
        }
        return GlobalShortcutManager.instance;
    }

    constructor() {
        /** @type {boolean} 是否已初始化（restoreAll 已调用） */
        this.initialized = false;

        /** @type {Map<string, Object>} 运行时回调映射：accelerator → { appId, mode } */
        this.activeCallbacks = new Map();
    }

    /**
     * 持久化存储 key 名
     */
    get STORAGE_KEY() {
        return 'globalShortcuts';
    }

    /**
     * 从 canbox.json 读取持久化的快捷键映射
     * @returns {Object<string, {appId: string, mode: string, registeredAt: string}>}
     */
    getPersistedShortcuts() {
        const store = getCanboxStore();
        return store.get(this.STORAGE_KEY, {});
    }

    /**
     * 将快捷键映射持久化到 canbox.json
     * @param {Object} shortcuts - 快捷键映射
     */
    persistShortcuts(shortcuts) {
        const store = getCanboxStore();
        store.set(this.STORAGE_KEY, shortcuts);
    }

    /**
     * 注册全局快捷键
     * @param {string} accelerator - Electron accelerator 字符串，如 'Alt+Space'
     * @param {string} appId - APP 唯一标识符
     * @param {string} mode - 触发模式：'focus' | 'callback'
     * @returns {Promise<{success: boolean, reason?: string, occupiedBy?: string}>}
     */
    async register(accelerator, appId, mode = 'focus') {
        if (!accelerator) {
            return { success: false, reason: 'invalid-accelerator' };
        }
        if (!appId) {
            return { success: false, reason: 'invalid-appId' };
        }

        const persistedShortcuts = this.getPersistedShortcuts();

        // 1. 检查是否已被其他 APP 占用（映射表中存在且 appId 不同）
        const existingEntry = persistedShortcuts[accelerator];
        if (existingEntry && existingEntry.appId !== appId) {
            const occupiedBy = this.getAppName(existingEntry.appId);
            logger.info('[GlobalShortcutManager] Shortcut {} already occupied by app {} ({}), rejecting registration from {}',
                accelerator, existingEntry.appId, occupiedBy, appId);
            return { success: false, reason: 'occupied', occupiedBy };
        }

        // 2. 如果同一 APP 重新注册，先清理旧的
        if (existingEntry && existingEntry.appId === appId) {
            logger.info('[GlobalShortcutManager] App {} re-registering shortcut {}, unregistering old one first', appId, accelerator);
            this._unregisterElectronShortcut(accelerator);
            delete persistedShortcuts[accelerator];
        }

        // 3. 尝试注册到 Electron globalShortcut
        try {
            const registered = this._registerElectronShortcut(accelerator, appId, mode);
            if (!registered) {
                logger.warn('[GlobalShortcutManager] Shortcut {} could not be registered (system-occupied)', accelerator);
                return { success: false, reason: 'system-occupied' };
            }
        } catch (error) {
            logger.error('[GlobalShortcutManager] Failed to register shortcut {}: {}', accelerator, error.message);
            return { success: false, reason: 'system-occupied' };
        }

        // 4. 持久化映射
        persistedShortcuts[accelerator] = {
            appId,
            mode,
            registeredAt: new Date().toISOString()
        };
        this.persistShortcuts(persistedShortcuts);

        logger.info('[GlobalShortcutManager] Shortcut {} registered for app {} with mode {}', accelerator, appId, mode);
        this._notifyChange();
        return { success: true };
    }

    /**
     * 注销全局快捷键
     * @param {string} accelerator - Electron accelerator 字符串
     * @param {string} appId - APP 唯一标识符（用于权限验证，只有注册者可以注销）
     * @returns {{success: boolean}}
     */
    unregister(accelerator, appId) {
        if (!accelerator || !appId) {
            return { success: false };
        }

        const persistedShortcuts = this.getPersistedShortcuts();
        const entry = persistedShortcuts[accelerator];

        // 权限验证：只有注册者可以注销
        if (!entry) {
            logger.warn('[GlobalShortcutManager] Shortcut {} is not registered', accelerator);
            return { success: false };
        }
        if (entry.appId !== appId) {
            logger.warn('[GlobalShortcutManager] App {} attempted to unregister shortcut {} owned by {}', appId, accelerator, entry.appId);
            return { success: false };
        }

        // 注销 Electron 快捷键
        this._unregisterElectronShortcut(accelerator);

        // 从持久化映射中删除
        delete persistedShortcuts[accelerator];
        this.persistShortcuts(persistedShortcuts);

        logger.info('[GlobalShortcutManager] Shortcut {} unregistered for app {}', accelerator, appId);
        this._notifyChange();
        return { success: true };
    }

    /**
     * 注销指定 APP 注册的所有快捷键（APP 卸载时调用）
     * @param {string} appId - APP 唯一标识符
     */
    unregisterAllByAppId(appId) {
        const persistedShortcuts = this.getPersistedShortcuts();
        let removed = 0;

        for (const [accelerator, entry] of Object.entries(persistedShortcuts)) {
            if (entry.appId === appId) {
                this._unregisterElectronShortcut(accelerator);
                delete persistedShortcuts[accelerator];
                removed++;
            }
        }

        if (removed > 0) {
            this.persistShortcuts(persistedShortcuts);
            logger.info('[GlobalShortcutManager] Unregistered {} shortcut(s) for app {}', removed, appId);
            this._notifyChange();
        }
    }

    /**
     * 注销所有全局快捷键（Canbox 退出时调用）
     */
    unregisterAll() {
        globalShortcut.unregisterAll();
        this.activeCallbacks.clear();
        logger.info('[GlobalShortcutManager] All global shortcuts unregistered');
    }

    /**
     * 从 canbox.json 恢复所有快捷键（Canbox 启动时调用）
     */
    restoreAll() {
        if (this.initialized) {
            logger.warn('[GlobalShortcutManager] Already initialized, skipping restoreAll');
            return;
        }

        const persistedShortcuts = this.getPersistedShortcuts();
        const entries = Object.entries(persistedShortcuts);

        if (entries.length === 0) {
            logger.info('[GlobalShortcutManager] No persisted shortcuts to restore');
            this.initialized = true;
            return;
        }

        let restoredCount = 0;
        let failedCount = 0;

        for (const [accelerator, entry] of entries) {
            const registered = this._registerElectronShortcut(accelerator, entry.appId, entry.mode);
            if (registered) {
                restoredCount++;
            } else {
                failedCount++;
                logger.warn('[GlobalShortcutManager] Failed to restore shortcut {} for app {}', accelerator, entry.appId);
            }
        }

        logger.info('[GlobalShortcutManager] Restored {}/{} shortcuts ({} failed)',
            restoredCount, entries.length, failedCount);

        this.initialized = true;
    }

    /**
     * 检查快捷键是否已注册
     * @param {string} accelerator - Electron accelerator 字符串
     * @param {string} [appId] - 可选，指定 appId 时检查是否由该 APP 注册
     * @returns {boolean}
     */
    isRegistered(accelerator, appId) {
        const persistedShortcuts = this.getPersistedShortcuts();
        const entry = persistedShortcuts[accelerator];

        if (!entry) {
            return false;
        }

        if (appId) {
            return entry.appId === appId;
        }

        return true;
    }

    /**
     * 获取指定 APP 注册的所有快捷键
     * @param {string} appId - APP 唯一标识符
     * @returns {Array<{accelerator: string, mode: string, registeredAt: string}>}
     */
    getRegisteredByAppId(appId) {
        const persistedShortcuts = this.getPersistedShortcuts();
        return Object.entries(persistedShortcuts)
            .filter(([, entry]) => entry.appId === appId)
            .map(([accelerator, entry]) => ({
                accelerator,
                mode: entry.mode,
                registeredAt: entry.registeredAt
            }));
    }

    /**
     * 获取所有已注册快捷键及 APP 名称（管理面板用）
     * @returns {Array<{accelerator: string, appId: string, appName: string, mode: string, registeredAt: string}>}
     */
    getAll() {
        const persistedShortcuts = this.getPersistedShortcuts();
        return Object.entries(persistedShortcuts).map(([accelerator, entry]) => ({
            accelerator,
            appId: entry.appId,
            appName: this.getAppName(entry.appId),
            mode: entry.mode,
            registeredAt: entry.registeredAt
        }));
    }

    /**
     * 强制注销快捷键（管理面板专用，无 appId 校验）
     * @param {string} accelerator - Electron accelerator 字符串
     * @returns {{success: boolean}}
     */
    forceUnregister(accelerator) {
        if (!accelerator) {
            return { success: false };
        }

        const persistedShortcuts = this.getPersistedShortcuts();

        if (!persistedShortcuts[accelerator]) {
            logger.warn('[GlobalShortcutManager] Shortcut {} is not registered (forceUnregister)', accelerator);
            return { success: false };
        }

        // 注销 Electron 快捷键
        this._unregisterElectronShortcut(accelerator);

        // 从持久化映射中删除
        delete persistedShortcuts[accelerator];
        this.persistShortcuts(persistedShortcuts);

        logger.info('[GlobalShortcutManager] Shortcut {} force unregistered', accelerator);
        this._notifyChange();
        return { success: true };
    }

    // ========== 私有方法 ==========

    /**
     * 向 Electron globalShortcut 注册快捷键
     * @param {string} accelerator
     * @param {string} appId
     * @param {string} mode
     * @returns {boolean} 是否注册成功
     */
    _registerElectronShortcut(accelerator, appId, mode) {
        const callback = () => {
            logger.info('[GlobalShortcutManager] Shortcut {} triggered for app {} (mode: {})', accelerator, appId, mode);
            this._handleTrigger(accelerator, appId, mode);
        };

        const result = globalShortcut.register(accelerator, callback);
        if (result) {
            this.activeCallbacks.set(accelerator, { appId, mode });
        }
        return result;
    }

    /**
     * 从 Electron globalShortcut 注销快捷键
     * @param {string} accelerator
     */
    _unregisterElectronShortcut(accelerator) {
        globalShortcut.unregister(accelerator);
        this.activeCallbacks.delete(accelerator);
    }

    /**
     * 通知主窗口快捷键列表已变更
     * 向所有 BrowserWindow 推送 shortcuts-changed 事件
     */
    _notifyChange() {
        try {
            const list = this.getAll();
            const windows = BrowserWindow.getAllWindows();
            for (const win of windows) {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('shortcuts-changed', list);
                }
            }
        } catch (error) {
            logger.error('[GlobalShortcutManager] Failed to notify shortcuts change:', error.message);
        }
    }

    /**
     * 处理快捷键触发
     * @param {string} accelerator
     * @param {string} appId
     * @param {string} mode
     */
    _handleTrigger(accelerator, appId, mode) {
        switch (mode) {
            case 'focus':
                this._handleFocus(appId);
                break;
            case 'callback':
                this._handleCallback(appId, accelerator);
                break;
            default:
                logger.warn('[GlobalShortcutManager] Unknown mode {} for app {}, falling back to focus', mode, appId);
                this._handleFocus(appId);
        }
    }

    /**
     * 聚焦模式：聚焦或启动 APP 窗口
     * @param {string} appId
     */
    _handleFocus(appId) {
        try {
            const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');

            if (executionDispatcher.isAppRunning(appId)) {
                // APP 正在运行，聚焦窗口
                executionDispatcher.focusApp(appId);
                logger.info('[GlobalShortcutManager] Focused app {} (already running)', appId);
            } else {
                // APP 未运行，启动它
                // 先判断是否在 appsDev.json 中（开发模式 APP），避免首次尝试 apps.json 产生无意义的错误日志
                let devTag = false;
                const appsDevStore = getAppsDevStore();
                const devEntry = appsDevStore.get('default');
                if (devEntry && devEntry[appId]) {
                    devTag = true;
                }
                let result = executionDispatcher.startApp(appId, devTag, null);
                if ((!result || !result.success) && !devTag) {
                    // 正式 APP 未找到，尝试开发模式 APP
                    logger.info('[GlobalShortcutManager] App {} not found in apps.json, trying appsDev.json', appId);
                    result = executionDispatcher.startApp(appId, true, null);
                }
                if (result && result.success) {
                    logger.info('[GlobalShortcutManager] Started app {} via shortcut', appId);
                } else {
                    logger.warn('[GlobalShortcutManager] Failed to start app {}: {}', appId,
                        (result && result.msg) ? result.msg : 'unknown error');
                }
            }
        } catch (error) {
            logger.error('[GlobalShortcutManager] Error in _handleFocus for app {}: {}', appId, error.message);
        }
    }

    /**
     * 事件模式：通过 IPC 通知 APP 渲染进程
     * @param {string} appId
     * @param {string} accelerator
     */
    _handleCallback(appId, accelerator) {
        try {
            // 查找 APP 对应的 BrowserWindow
            const executionDispatcher = require('@modules/canbox/execution/executionDispatcher');
            const appWindowManager = require('@modules/canbox/integrated/appWindowManager');
            const childprocessAppManager = require('@modules/canbox/childprocess/childprocessAppManager');

            // 尝试从窗口管理器获取窗口
            let win = appWindowManager.getWindow(appId);

            // 如果窗口不存在，尝试子进程模式
            if (!win || win.isDestroyed()) {
                const childWin = childprocessAppManager.getWindow(appId);
                if (childWin && !childWin.isDestroyed()) {
                    win = childWin;
                }
            }

            if (win && !win.isDestroyed()) {
                win.webContents.send('shortcut-triggered', accelerator);
                logger.info('[GlobalShortcutManager] Sent shortcut-triggered event to app {} (accelerator: {})', appId, accelerator);
            } else {
                logger.warn('[GlobalShortcutManager] App {} is not running, cannot send callback event', appId);
            }
        } catch (error) {
            logger.error('[GlobalShortcutManager] Error in _handleCallback for app {}: {}', appId, error.message);
        }
    }

    /**
     * 获取 APP 显示名称（用于冲突提示）
     * @param {string} appId
     * @returns {string}
     */
    getAppName(appId) {
        try {
            const { getAllApps } = require('@modules/canbox/main/appManager');
            const apps = getAllApps();
            const appName = apps.data && apps.data[appId]
                ? (apps.data[appId].appJson?.name || apps.data[appId].name || appId)
                : appId;
            return appName;
        } catch (error) {
            logger.warn('[GlobalShortcutManager] Failed to get app name for {}: {}', appId, error.message);
            return appId;
        }
    }
}

module.exports = GlobalShortcutManager;
