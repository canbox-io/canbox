const { contextBridge, ipcRenderer, webFrame } = require("electron");

// 注册窗口关闭回调
let __closeCallback = null;

/**
 * 注册窗口关闭时的回调函数
 * @param {Function} callback - 窗口关闭时执行的回调函数
 */
const registerCloseCallback = (callback) => {
    __closeCallback = callback;
};

// 监听窗口关闭事件
ipcRenderer.on('window-close-callback', () => {
    if (__closeCallback) {
        try {
            __closeCallback();
        } catch (e) {
            console.error('Error executing close callback / 执行关闭回调错误:', e);
        }
    }
});

/**
 * 通过 ipc 请求主线程中的 db-api，ipc 消息名为：msg-db
 *
 * @param {String} type api操作方法
 * @param {Object} param api操作请求数据，要求json格式
 * @returns {Object} api操作应答内容
 */
const ipcSendSyncDB = (type, param) => {
    if (!window.appId) {
        throw new Error('appId is not set');
    }
    let returnValue = ipcRenderer.sendSync('msg-db', {
        type,
        param,
        appId: window.appId
    });
    console.info('returnValue in app.api== / app.api 中的返回值:', returnValue);
    if (returnValue instanceof Error) throw returnValue;
    return JSON.parse(returnValue);
};

/**
 * 通过 ipc 请求主线程中的 window-api，ipc 消息名为：msg-window
 *
 * @param {String} type api操作方法
 * @param {Object} param api操作请求数据，要求json格式
 * @returns {Object} api操作应答内容
 */
const ipcSendSyncCreateWindow = (options, params) => {
    if (!window.appId) {
        throw new Error('appId is not set');
    }
    let returnValue = ipcRenderer.sendSync('msg-createWindow', {
        options,
        params,
        appId: window.appId
    });
    if (returnValue instanceof Error) throw returnValue;
    return JSON.parse(returnValue);
};

/**
 * 通过 ipc 请求主线程中的 dialog-api，ipc 消息名为：msg-dialog
 *
 * @param {String} type api操作方法
 * @param {Object} options api操作请求数据，要求json格式
 * @returns {Object} api操作应答内容
 */
const ipcSendSyncDialog = (type, options) => {
    if (!window.appId) {
        throw new Error('appId is not set');
    }
    let returnValue = ipcRenderer.sendSync('msg-dialog', {
        type,
        options,
        appId: window.appId
    });
    if (returnValue instanceof Error) throw returnValue;
    return JSON.parse(returnValue);
};

const ipcSendNotification = (options) => {
    if (!window.appId) {
        throw new Error('appId is not set');
    }
    ipcRenderer.send('msg-notification', {
        options,
        appId: window.appId
    });
};

/**
 * 发送 IPC 消息到主进程，操作 electronStore
 * @param {string} type - 操作类型，支持 'get'、'set'、'delete'、'clear'
 * @param {object} param - 参数对象
 * @param {string} param.key - 存储的键
 * @param {any} [param.value] - 存储的值（仅 'set' 操作需要）
 * @returns {object} - 返回操作结果，格式为 { success: boolean, data: any }
 * @throws {Error} - 如果 appId 未设置或 IPC 通信失败
 */
const ipcSendElectronStore = (type, param) => {
    if (!window.appId) {
        throw new Error('appId is not set');
    }
    let returnValue = ipcRenderer.sendSync('msg-electronStore', {
        type,
        param,
        appId: window.appId
    });
    if (returnValue instanceof Error) throw returnValue;
    return JSON.parse(returnValue);
};

const db = {
    /**
     * 新增或更新文档
     * @param {object} param - 文档对象，必须包含 `_id` 字段
     * @returns {Promise<any>} - 返回操作结果，成功时返回文档数据，失败时返回错误信息
     * @example
     * canbox.db.put({ _id: 'doc1', name: 'test' })
     *   .then(data => console.log(data))
     *   .catch(err => console.error(err));
     */
    put: (param) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDB('put', param);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        });
    },
    /**
     * 批量新增或更新文档
     * @param {Array<object>} docs - 文档数组，每个文档必须包含 `_id` 字段
     * @returns {Promise<Array<any>>} - 返回操作结果数组，成功时返回文档数据，失败时返回错误信息
     * @example
     * canbox.db.bulkDocs([{ _id: 'doc1', name: 'test1' }, { _id: 'doc2', name: 'test2' }])
     *   .then(data => console.log(data))
     *   .catch(err => console.error(err));
     */
    bulkDocs: (docs) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDB('bulkDocs', docs);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        });
    },
    /**
     * 获取文档
     * @param {object} param - 查询参数，必须包含 `_id` 字段
     * @returns {Promise<any>} - 返回查询结果，成功时返回文档数据，失败时返回错误信息
     * @example
     * canbox.db.get({ _id: 'doc1' })
     *   .then(data => console.log(data))
     *   .catch(err => console.error(err));
     */
    get: (param) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDB('get', param);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        })
    },
    /**
     * 同步获取文档
     * @param {object} param - 查询参数，必须包含 `_id` 字段
     * @returns {any|null} - 返回查询结果，成功时返回文档数据，失败时返回 null
     * @example
     * const doc = canbox.db.getSync({ _id: 'doc1' });
     * console.log(doc);
     */
    getSync: (param) => {
        const ret = ipcSendSyncDB('get', param);
        console.log('ret in app.preload.js== / app.preload.js 中的 ret:', ret);
        console.log('ret in app.preload.js==ret.success: / app.preload.js 中的 ret.success:', ret.success);
        return ret.success ? ret.data : null;
    },
    /**
     * 删除文档
     * @param {object} param - 删除参数，必须包含 `_id` 字段
     * @returns {Promise<any>} - 返回操作结果，成功时返回删除的文档数据，失败时返回错误信息
     * @example
     * canbox.db.remove({ _id: 'doc1' })
     *   .then(data => console.log(data))
     *   .catch(err => console.error(err));
     */
    remove: (param) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDB('remove', param);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        })
    },
    /**
     * 查询文档
     * @param {object} query - 查询条件，支持 Mango 查询语法
     * @returns {Promise<any>} - 返回查询结果，成功时返回文档数组，失败时返回错误信息
     * @example
     * canbox.db.find({ selector: { type: 'hosts_entry' } })
     *   .then(data => console.log(data.docs))
     *   .catch(err => console.error(err));
     */
    find: (query) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDB('find', query);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        })
    },
    /**
     * 创建索引
     * @param {object} index - 索引配置对象
     * @returns {Promise<any>} - 返回创建结果，成功时返回索引信息，失败时返回错误信息
     * @example
     * canbox.db.createIndex({ index: { fields: ['type'] } })
     *   .then(data => console.log(data))
     *   .catch(err => console.error(err));
     */
    createIndex: (index) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDB('createIndex', index);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        })
    },
    /**
     * 获取所有文档
     * @param {object} options - 查询选项
     * @returns {Promise<any>} - 返回查询结果，成功时返回文档列表，失败时返回错误信息
     * @example
     * canbox.db.allDocs({ include_docs: true })
     *   .then(data => console.log(data))
     *   .catch(err => console.error(err));
     */
    allDocs: (options) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDB('allDocs', options);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        })
    }
}

const sudo = {
    /**
     * 执行需要提权的命令
     * @param {object} options - 提权选项
     * @param {string} options.command - 要执行的命令
     * @param {string} options.name - 操作名称（用于提示用户）
     * @returns {Promise<any>} - 返回执行结果
     * @example
     * canbox.sudo.exec({
     *     command: 'echo "127.0.0.1 example.com" >> /etc/hosts',
     *     name: '修改 hosts 文件'
     * })
     *   .then(data => console.log(data))
     *   .catch(err => console.error(err));
     */
    exec: (options) => {
        return new Promise((resolve, reject) => {
            if (!window.appId) {
                throw new Error('appId is not set');
            }
            ipcRenderer.invoke('msg-sudo', {
                options,
                appId: window.appId
            }).then(result => {
                result.success ? resolve(result.data) : reject(new Error(result.msg));
            }).catch(err => {
                console.error('[canbox.sudo.exec] IPC error:', err);
                reject(err);
            });
        });
    }
};

const dialog = {
    /**
     * 打开文件对话框
     * @param {Object} options - 对话框配置
     * @returns {Promise} 对话框结果
     */
    showOpenDialog: (options) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDialog('showOpenDialog', options);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        });
    },
    /**
     * 打开保存对话框
     * @param {Object} options - 对话框配置
     * @returns {Promise} 对话框结果
     */
    showSaveDialog: (options) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDialog('showSaveDialog', options);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        });
    },
    /**
     * 打开消息对话框
     * @param {Object} options - 对话框配置
     * @returns {Promise} 对话框结果
     */
    showMessageBox: (options) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncDialog('showMessageBox', options);
            ret.success ? resolve(ret.data) : reject(ret.msg);
        });
    }
}

const win = {
    /**
     * 
     * @param {Object} options - 窗口配置
     * @param {Object} params - 其他参数，如：{ url: '', title: '', devTools: false }
     * @returns 
     */
    createWindow: (options, params) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendSyncCreateWindow(options, params);
            console.info('ret: / 返回值:', ret);
            null !== ret ? resolve(ret) : reject(null);
        });
    },
    /**
     * 发出通知
     * @param {Object} options - 窗口配置
     * @param {String} options.title - 窗口标题
     * @param {String} options.body - 窗口内容
     * @returns 
     */
    notification: (options) => {
        console.info('options: / 选项:', options);
        return new Promise((resolve) => {
            ipcSendNotification(options);
            resolve(); // 直接 resolve，表示通知已发送
        });
    }
};

const electronStore = {
    /**
     * 获取存储的值
     * @param {string} name 存储的名称
     * @param {string} key - 存储的键
     * @returns {Promise<any>} - 返回存储的值
     */
    get: (name, key) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendElectronStore('get', { name, key });
            ret.success ? resolve(ret.data) : reject(ret.msg);
        });
    },

    /**
     * 设置存储的值
     * @param {string} name 存储的名称
     * @param {string} key - 存储的键
     * @param {any} value - 存储的值
     * @returns {Promise<void>}
     */
    set: (name, key, value) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendElectronStore('set', { name, key, value });
            ret.success ? resolve() : reject(ret.msg);
        });
    },

    /**
     * 删除存储的值
     * @param {string} name 存储的名称
     * @param {string} key - 存储的键
     * @returns {Promise<void>}
     */
    delete: (name, key) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendElectronStore('delete', { name, key });
            ret.success ? resolve() : reject(ret.msg);
        });
    },

    /**
     * 清空存储
     * @param {string} name 存储的名称
     * @returns {Promise<void>}
     */
    clear: (name) => {
        return new Promise((resolve, reject) => {
            const ret = ipcSendElectronStore('clear', { name });
            ret.success ? resolve() : reject(ret.msg);
        });
    }
}

const ipcSendOpenUrl = (url) => {
    if (!window.appId) {
        throw new Error('appId is not set');
    }
    let returnValue = ipcRenderer.sendSync('msg-openUrl', {
        url,
        appId: window.appId
    });
    if (returnValue instanceof Error) throw returnValue;
    return JSON.parse(returnValue);
};

const openUrl = (url) => {
    return new Promise((resolve, reject) => {
        const ret = ipcSendOpenUrl(url);
        ret.success ? resolve() : reject(ret.msg);
    });
};

/**
 * 获取 canbox 当前语言设置
 * @returns {string} 当前语言代码，如 'zh-CN' 或 'en-US'
 * @example
 * const locale = canbox.getLocale();
 * console.log(locale); // 'zh-CN'
 */
const getLocale = () => {
    if (!window.appId) {
        throw new Error('appId is not set');
    }
    const language = ipcRenderer.sendSync('i18n-get-locale');
    console.log('[canbox.getLocale] Returning language:', language);
    return language;
};

/**
 * 缩放桥接：通过 contextBridge 暴露 webFrame 缩放 API 到主世界
 * 供 app-zoom.js 注入脚本（executeJavaScript）调用
 * webFrame.setZoomFactor() 与浏览器 Ctrl++ 缩放行为一致，会触发页面重排
 */
contextBridge.exposeInMainWorld('__canboxZoom', {
    setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
    getZoomFactor: () => webFrame.getZoomFactor()
});

// 注册快捷键触发回调
let __onShortcutTriggered = null;

/**
 * 注册全局快捷键触发时的回调函数
 * @param {Function} callback - 快捷键触发时执行的回调函数，参数为 accelerator 字符串
 */
const onShortcutTriggered = (callback) => {
    __onShortcutTriggered = callback;
};

// 监听主进程发送的快捷键触发事件
ipcRenderer.on('shortcut-triggered', (event, accelerator) => {
    if (__onShortcutTriggered) {
        try {
            __onShortcutTriggered(accelerator);
        } catch (e) {
            console.error('Error executing shortcut callback / 执行快捷键回调错误:', e);
        }
    }
});

const shortcut = {
    /**
     * 注册全局快捷键
     * @param {string} accelerator - Electron accelerator 字符串，如 'Alt+Space'
     * @param {Object} [options] - 可选配置
     * @param {string} [options.mode='focus'] - 触发模式：'focus'（聚焦窗口）或 'callback'（事件通知）
     * @returns {Promise<{success: boolean, reason?: string, occupiedBy?: string}>}
     * @example
     * // 聚焦模式
     * canbox.shortcut.register('Alt+Space', { mode: 'focus' })
     *     .then(result => console.info(result));
     *
     * // 事件模式
     * canbox.shortcut.register('Alt+X', { mode: 'callback' })
     *     .then(result => console.info(result));
     */
    register: (accelerator, options = {}) => {
        if (!window.appId) throw new Error('appId is not set');
        return ipcRenderer.invoke('shortcut-register', {
            accelerator,
            options,
            appId: window.appId
        });
    },
    /**
     * 注销全局快捷键
     * @param {string} accelerator - Electron accelerator 字符串
     * @returns {Promise<{success: boolean}>}
     */
    unregister: (accelerator) => {
        if (!window.appId) throw new Error('appId is not set');
        return ipcRenderer.invoke('shortcut-unregister', {
            accelerator,
            appId: window.appId
        });
    },
    /**
     * 检查快捷键是否已注册
     * @param {string} accelerator - Electron accelerator 字符串
     * @returns {Promise<boolean>}
     */
    isRegistered: (accelerator) => {
        if (!window.appId) throw new Error('appId is not set');
        return ipcRenderer.invoke('shortcut-isRegistered', {
            accelerator,
            appId: window.appId
        });
    },
    /**
     * 监听快捷键触发事件（callback 模式）
     * @param {Function} callback - 触发时的回调函数，参数为 accelerator 字符串
     */
    onTriggered: (callback) => {
        __onShortcutTriggered = callback;
    }
};

/**
 * 窗口控制模块
 * 提供当前 APP 窗口的隐藏/显示能力
 */
const windowControl = {
    /**
     * 隐藏当前 APP 窗口
     * @returns {Promise<{success: boolean}>}
     * @example
     * canbox.windowControl.hide()
     *     .then(result => console.log('hidden'))
     *     .catch(err => console.error(err));
     */
    hide: () => {
        if (!window.appId) throw new Error('appId is not set');
        return ipcRenderer.invoke('app-window-control', {
            appId: window.appId,
            action: 'hide'
        });
    },
    /**
     * 显示并聚焦当前 APP 窗口
     * @returns {Promise<{success: boolean}>}
     * @example
     * canbox.windowControl.show()
     *     .then(result => console.log('shown'))
     *     .catch(err => console.error(err));
     */
    show: () => {
        if (!window.appId) throw new Error('appId is not set');
        return ipcRenderer.invoke('app-window-control', {
            appId: window.appId,
            action: 'show'
        });
    }
};

/**
 * 对 app 暴露的 api
 */
window.appId = null;
window.canbox = {
    hooks: {},
    hello: () => {
        console.info('hello, hope you have a nice day / 你好，祝你有美好的一天');
        console.info('hello, appId: / appId:', appId);
    },
    db,
    sudo,
    win,
    dialog,
    store: electronStore,
    registerCloseCallback,
    getLocale,
    openUrl,
    shortcut,
    windowControl,
};

// 从 additionalArguments 读取 ID（主进程传递）
for (const arg of process.argv) {
    if (arg.startsWith('--app-id=')) {
        appId = arg.split('=')[1];
        break;
    }
}
