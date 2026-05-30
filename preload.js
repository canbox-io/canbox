const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
    "api", {
        i18n: {
            getLanguage: () => ipcRenderer.invoke('i18n-get-language'),
            setLanguage: (lang) => ipcRenderer.invoke('i18n-set-language', lang),
            getAvailableLanguages: () => ipcRenderer.invoke('i18n-get-available-languages'),
            translate: (key, params) => ipcRenderer.invoke('i18n-translate', key, params)
        },
        font: {
            get: () => ipcRenderer.invoke('font-get'),
            set: (fontValue) => ipcRenderer.invoke('font-set', fontValue)
        },
        execution: {
            getGlobalMode: () => ipcRenderer.invoke('execution-get-global-mode'),
            setGlobalMode: (mode) => ipcRenderer.invoke('execution-set-global-mode', mode),
            getAllAppModes: () => ipcRenderer.invoke('execution-get-all-app-modes'),
            setAppMode: (uid, mode) => ipcRenderer.invoke('execution-set-app-mode', uid, mode)
        },
        userData: {
            getCurrentPath: () => ipcRenderer.invoke('userData:getCurrentPath'),
            getDiskUsage: () => ipcRenderer.invoke('userData:getDiskUsage'),
            selectDirectory: () => ipcRenderer.invoke('userData:selectDirectory'),
            migrate: (newBasePath) => ipcRenderer.invoke('userData:migrate', newBasePath),
            resetToDefault: () => ipcRenderer.invoke('userData:resetToDefault'),
            restartNow: () => ipcRenderer.invoke('userData:restartNow')
        },
        quit: () => ipcRenderer.invoke('app:quit'),
        log: {
            openViewer: () => ipcRenderer.invoke('log-viewer:open'),
            getLogs: (options) => ipcRenderer.invoke('get-logs', options),
            getLogFiles: (source) => ipcRenderer.invoke('get-log-files', source),
            exportLogs: (format, range) => ipcRenderer.invoke('export-logs', format, range),
            clearLogs: (source) => ipcRenderer.invoke('clear-logs', source),
            cleanupOldLogs: (days) => ipcRenderer.invoke('cleanup-old-logs', days),
            toggleAlwaysOnTop: () => ipcRenderer.invoke('log-viewer:toggle-always-on-top')
        },
        logViewer: {
            getRetentionDays: () => ipcRenderer.invoke('logViewer:getRetentionDays'),
            setRetentionDays: (days) => ipcRenderer.invoke('logViewer:setRetentionDays', days)
        },
        autoUpdate: {
            checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
            downloadUpdate: () => ipcRenderer.invoke('download-update'),
            installUpdate: () => ipcRenderer.invoke('install-update'),
            cancelDownload: () => ipcRenderer.invoke('cancel-download'),
            getStatus: () => ipcRenderer.invoke('get-update-status'),
            getConfig: () => ipcRenderer.invoke('get-update-config'),
            saveConfig: (config) => ipcRenderer.invoke('save-update-config', config),
            skipVersion: (version) => ipcRenderer.invoke('skip-version', version)
        },
        updateSource: {
            get: () => ipcRenderer.invoke('update-source:get'),
            set: (source) => ipcRenderer.invoke('update-source:set', source)
        },
        on: (eventName, callback) => {
            ipcRenderer.on(eventName, callback);
        },
        send: (eventName, ...args) => {
            ipcRenderer.send(eventName, ...args);
        },
        generateShortcut: (fn) => {
            ipcRenderer.invoke('generate-shortcut').then(result => {
                fn(result);
            }).catch(error => {
                console.error('IPC call failed:', error);
                fn({ success: false, msg: error.message });
            });
        },
        deleteShortcut: (fn) => {
            ipcRenderer.invoke('delete-shortcut').then(result => {
                fn(result);
            }).catch(error => {
                console.error('IPC call failed:', error);
                fn({ success: false, msg: error.message });
            });
        },
        updateReposStatus: (appId, fn) => ipcRenderer.invoke('update-repos-status', appId).then(result => {
            fn(result);
        }).catch(error => {
            fn({ success: false, msg: error.message });
        }),
        openUrl: (url) => {
            console.info('url====', url);
            ipcRenderer.send('open-url', url);
        },
        openHtml: async (htmlContent, docName) => {
            return ipcRenderer.invoke('open-html', htmlContent, docName);
        },
        selectFile: (options) => {
            return ipcRenderer.invoke('select-file', options);
        },
        importApp: (zipPath) => {
            return ipcRenderer.invoke('import-app', zipPath);
        },
        exportApp: (uid, savePath) => {
            return ipcRenderer.invoke('export-app', uid, savePath);
        },
        selectExportPath: (defaultName) => {
            return ipcRenderer.invoke('select-export-path', defaultName);
        },
        packToAsar: (uid) => {
            return ipcRenderer.invoke('pack-asar', uid);
        },
        app: {
            info: (uid, fn) => {
                ipcRenderer.invoke('getAppInfo', uid).then(result => {
                    fn(result);
                }).catch(error => {
                    console.error('IPC call failed:', error);
                    fn({ success: false, msg: error.message });
                });
            },
            all: (fn) => {
                ipcRenderer.invoke('get-all-apps').then(result => {fn(result)}).catch(error => {fn({success: false, msg: error.message})});
            },
            load: (uid, devTag) => {
                ipcRenderer.send('load-app', uid, devTag);
            },
            clearData: (id, fn) => {
                ipcRenderer.invoke('clearAppData', id).then(result => {
                    fn(result);
                }).catch(error => {
                    console.error('IPC call failed:', error);
                    fn({ success: false, msg: error.message });
                });
            },
            remove: (param, fn) => {
                console.info('remove app param======', param);
                ipcRenderer.invoke('remove-app', param).then((result) => {
                    fn(result);
                }).catch(err => {
                    console.info('应用删除失败: ', err);
                    fn({success: false, msg: '应用删除失败！' + err.message});
                })
            }
        },
        appDev: {
            all: (fn) => ipcRenderer.invoke('get-apps-dev-data').then(result => fn(result)).catch(error => {
                console.error('IPC call failed:', error);
                fn(null);
            }),
            add: (fn) => ipcRenderer.invoke('handle-app-dev-add').then(result => fn(result)).catch(error => {
                console.error('IPC call failed:', error);
                fn(null);
            }),
            info: (uid, fn) => {
                ipcRenderer.invoke('getAppDevInfo', uid).then(result => {
                    fn(result);
                }).catch(error => {
                    console.error('IPC call failed:', error);
                    fn({ success: false, msg: error.message });
                });
            }
        },
        addAppRepo: (repoUrl, fn) => ipcRenderer.invoke('add-app-repo', repoUrl).then(result => {
            fn(result);
        }).catch(error => {
            console.error('addAppRepo: IPC call failed:', error);
            // 解析错误消息，提取真正的错误类型
            let errorMsg = error.message;
            // 尝试从完整的错误消息中提取错误类型
            const match = errorMsg.match(/Error: (.+)$/);
            if (match && match[1]) {
                errorMsg = match[1];
            }
            fn({ success: false, msg: errorMsg });
        }),
        importAppRepos: (fn) => {
            ipcRenderer.invoke('import-app-repos').then(result => {
                fn(result);
            }).catch(error => {
                console.error('importAppRepos: IPC call failed:', error);
                // 解析错误消息，提取真正的错误类型
                let errorMsg = error.message;
                const match = errorMsg.match(/Error: (.+)$/);
                if (match && match[1]) {
                    errorMsg = match[1];
                }
                fn({ success: false, msg: errorMsg });
            });
        },
        getReposData: (fn) => {
            ipcRenderer.invoke('get-repos-data').then(result => {
                fn(result);
            }).catch(error => {
                console.error('getReposList: IPC call failed:', error);
                fn({success: false, msg: error.message});
            });
        },
        exportReposData: (fn) => {
            ipcRenderer.invoke('export-repos-data').then(result => {
                fn(result);
            }).catch(error => {
                console.error('exportReposData: IPC call failed:', error);
                fn({success: false, msg: error.message});
            });
        },
        removeRepo: (uid, fn) => {
            ipcRenderer.invoke('remove-repo', uid).then(result => {
                fn(result);
            }).catch(error => {
                console.error('removeRepo: IPC call failed:', error);
                // 解析错误消息，提取真正的错误类型
                let errorMsg = error.message;
                const match = errorMsg.match(/Error: (.+)$/);
                if (match && match[1]) {
                    errorMsg = match[1];
                }
                fn({ success: false, msg: errorMsg });
            });
        },
        downloadAppsFromRepo: (uid, fn) => {
            ipcRenderer.invoke('download-apps-from-repo', uid).then(result => {
                fn(result);
            }).catch(error => {
                console.error('downloadAppsFromRepo: IPC call failed:', error);
                // 解析错误消息，提取真正的错误类型
                let errorMsg = error.message;
                const match = errorMsg.match(/Error: (.+)$/);
                if (match && match[1]) {
                    errorMsg = match[1];
                }
                fn({ success: false, msg: errorMsg });
            });
        },
        repo: {
            info: (uid, fn) => {
                ipcRenderer.invoke('getRepoInfo', uid).then(result => {
                    fn(result);
                }).catch(error => {
                    console.error('IPC call failed:', error);
                    fn({ success: false, msg: error.message });
                });
            }
        },
        readFile: (filePath) => {
            return ipcRenderer.invoke('msg-readFile', { filePath });
        },
        downloadCanboxTypes: () => {
            return ipcRenderer.invoke('download-canbox-types');
        },
        getVersions: () => {
            return ipcRenderer.invoke('get-versions');
        },
        getAppInfo: () => {
            return ipcRenderer.invoke('get-app-info');
        },
        zoom: {
            get: () => ipcRenderer.invoke('zoom-get'),
            set: (factor) => ipcRenderer.invoke('zoom-set', factor),
            reset: () => ipcRenderer.invoke('zoom-reset'),
            onChanged: (callback) => {
                ipcRenderer.on('zoom-changed', (event, factor) => callback(factor));
            }
        },
        menu: {
            getLast: () => ipcRenderer.invoke('menu-get-last'),
            setLast: (menuName) => ipcRenderer.invoke('menu-set-last', menuName)
        },
        canboxConfig: {
            get: (key, defaultValue) => ipcRenderer.invoke('canboxConfig-get', key, defaultValue),
            set: (key, value) => ipcRenderer.invoke('canboxConfig-set', key, value)
        },
        fileTask: {
            // 创建任务
            create: (type, uid, options) =>
                ipcRenderer.invoke('file-task-create', type, uid, options),

            // 取消任务
            cancel: (taskId) =>
                ipcRenderer.invoke('file-task-cancel', taskId),

            // 重试任务
            retry: (taskId) =>
                ipcRenderer.invoke('file-task-retry', taskId),

            // 获取所有任务
            getAll: () =>
                ipcRenderer.invoke('file-task-get-all'),

            // 获取运行中的任务
            getRunning: () =>
                ipcRenderer.invoke('file-task-get-running'),

            // 获取任务统计
            getStats: () =>
                ipcRenderer.invoke('file-task-get-stats'),

            // 监听任务更新
            onUpdate: (callback) => {
                const wrapper = (event, task) => callback(task);
                ipcRenderer.on('file-task-update', wrapper);
                // 保存 wrapper 引用，以便 offUpdate 能正确移除
                if (!window.__fileTaskCallbacks) {
                    window.__fileTaskCallbacks = new Map();
                }
                window.__fileTaskCallbacks.set(callback, wrapper);
            },

            // 监听任务列表更新
            onListUpdate: (callback) =>
                ipcRenderer.on('file-task-list', (event, tasks) => callback(tasks)),

            // 移除任务更新监听
            offUpdate: (callback) => {
                if (callback && window.__fileTaskCallbacks) {
                    const wrapper = window.__fileTaskCallbacks.get(callback);
                    if (wrapper) {
                        ipcRenderer.removeListener('file-task-update', wrapper);
                        window.__fileTaskCallbacks.delete(callback);
                    }
                }
            },

            // 移除任务列表监听
            offListUpdate: () =>
                ipcRenderer.removeAllListeners('file-task-list'),

            // 请求推送完整列表
            requestList: () =>
                ipcRenderer.invoke('file-task-request-list'),

            // 删除单个任务
            deleteTask: (taskId) =>
                ipcRenderer.invoke('file-task-delete', taskId),

            // 清理已完成的任务
            clearCompleted: () =>
                ipcRenderer.invoke('file-task-clear-completed'),

            // 清理所有任务
            clearAll: () =>
                ipcRenderer.invoke('file-task-clear-all'),

            // 按天数清理过期任务
            cleanupByDays: (maxDays) =>
                ipcRenderer.invoke('file-task-cleanup-by-days', maxDays),
        },
        canboxDb: {
            // 写入记录
            put: (param) => ipcRenderer.invoke('canboxDb-put', param),

            // 获取单条记录
            get: (param) => ipcRenderer.invoke('canboxDb-get', param),

            // 查询记录
            find: (query) => ipcRenderer.invoke('canboxDb-find', query),

            // 删除记录
            remove: (param) => ipcRenderer.invoke('canboxDb-remove', param),

            // 获取所有记录
            allDocs: (options) => ipcRenderer.invoke('canboxDb-allDocs', options),

            // 获取存储大小
            getSize: () => ipcRenderer.invoke('canboxDb-getSize'),

            // 清理过期记录
            cleanup: (maxDays) => ipcRenderer.invoke('canboxDb-cleanup', maxDays),
        },
        webApp: {
            fetchWebsiteInfo: (url) => ipcRenderer.invoke('fetch-website-info', url),
            createWebApp: (options) => ipcRenderer.invoke('create-web-app', options),
            getDefaultIconPath: () => ipcRenderer.invoke('get-default-icon-path')
        }
    }
);
