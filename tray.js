const { app, dialog, Menu, Tray } = require('electron');
const path = require('path')
const package = require('./package.json');
const { translate } = require('./locales');
const logWindowManager = require('@modules/canbox/main/logWindowManager');

// 窗口状态保存函数（由 main.js 注入）
let saveWindowStateFn = null;
// 保存托盘实例和窗口实例，用于重建菜单
let trayInstance = null;
let windowInstance = null;

// 构建托盘菜单模板
function buildTrayMenuTemplate(currentLang) {
    return [{
        label: translate('tray.showWindow', currentLang),
        type: 'normal',
        click: function() {
            windowInstance.show();
        }
    }, {
        label: translate('tray.hideWindow', currentLang),
        type: 'normal',
        click: function() {
            windowInstance.hide();
        }
    }, {
        type: 'separator'
    }, {
        label: translate('tray.openLogViewer', currentLang),
        type: 'normal',
        click: function() {
            logWindowManager.openLogViewer();
        }
    }, {
        type: 'separator'
    }, {
        label: translate('tray.toggleDevTools', currentLang),
        type: 'normal',
        click: function() {
            windowInstance.webContents.openDevTools({mode: 'detach'});
        }
    }, {
        label: translate('tray.reloadCanbox', currentLang),
        type: 'normal',
        click: function() {
            windowInstance.webContents.reload();
        }
    }, {
        label: translate('tray.about', currentLang),
        type: 'normal',
        click: function() {
            dialog.showMessageBox({
                type: 'info',
                title: translate('tray.about', currentLang),
                message: package.name + ':' + package.version + '\n' + package.description + '\nnode:' + process.versions['node'] + '\nchrome:' + process.versions['chrome'] + '\nelectron:' + process.versions['electron']
            });
        }
    }, {
        label: translate('tray.projectRepository', currentLang),
        type: 'normal',
        click: function() {
            let exec = require('child_process').exec
                , locale = app.getLocale()
                , url = ''
            // 使用ip的话要么自己维护一个ip库放在外部（太大，没必要放项目里），要么使用第三方，都需要进行网络交互
            // 所以这里使用一个最粗略的方式"语言环境"来判断是否是中国大陆
            if(locale.indexOf('zh-CN') == -1) {
                url = 'https://github.com/rexlevin/canbox'
            } else {
                url = 'https://gitee.com/rexlevin/canbox'
            }
            exec('open ' + url)
        }
    }, {
        label: translate('tray.quit', currentLang),
        type: 'normal',
        click: function() {
            // 先保存窗口状态
            if (saveWindowStateFn) {
                saveWindowStateFn();
            }

            // 退出canbox
            windowInstance.destroy(); // 强制关闭窗口，会触发win的closed事件，不会触发close事件
        }
    }];
}

module.exports = {
    // 设置窗口状态保存函数
    setSaveWindowStateFn: (fn) => {
        saveWindowStateFn = fn;
    },

    createTray: (win) => {
        // console.info(1, __dirname);
        const currentLang = require('./ipcHandlers').getCurrentLanguage?.() || 'zh-CN';
        windowInstance = win;

        trayInstance = new Tray(path.join(__dirname, './logo.png'));
        updateTrayMenu(currentLang);

        trayInstance.on('click', () => {
            win.isVisible() ? win.hide() : win.show();
            win.isVisible() ? win.setSkipTaskbar(false) : win.setSkipTaskbar(true);
        });

        // 监听语言变化事件，更新托盘菜单
        app.on('language-changed', (lang) => {
            updateTrayMenu(lang);
        });
    },
}

// 更新托盘菜单
function updateTrayMenu(currentLang) {
    if (!trayInstance) return;

    const trayMenuTemplate = buildTrayMenuTemplate(currentLang);
    const menu = Menu.buildFromTemplate(trayMenuTemplate);
    trayInstance.setContextMenu(menu);
}
