const { app, ipcMain } = require('electron');
const appLauncherManager = require('@modules/canbox/main/appLauncherManager');
const { getAllApps } = require('@modules/canbox/main/appManager');

/**
 * 初始化启动器相关的 IPC 处理逻辑
 */
function initLauncherHandlers() {
    // 生成启动器
    ipcMain.handle('generate-launchers', async () => {
        if (!app.isPackaged) {
            return { success: false, msg: '只能在生产环境下生成快捷方式' };
        }
        const apps = await getAllApps();
        return await appLauncherManager.generateLaunchers(apps.data);
    });

    // 删除启动器
    ipcMain.handle('delete-launchers', async () => {
        if (!app.isPackaged) {
            return { success: false, msg: '只能在生产环境下删除快捷方式' };
        }
        const apps = await getAllApps();
        return appLauncherManager.deleteLaunchers(apps.data);
    });
}

module.exports = {
    init: initLauncherHandlers
};