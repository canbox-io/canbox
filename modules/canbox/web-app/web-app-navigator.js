const { shell, Menu } = require('electron');
const logger = require('@modules/utils/logger');

function setupWebAppNavigation(win) {
    if (!win || win.isDestroyed()) return;

    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;

        const canGoBack = win.webContents.canGoBack();
        const canGoForward = win.webContents.canGoForward();

        if (input.alt && input.key === 'ArrowLeft' && canGoBack) {
            win.webContents.goBack();
            event.preventDefault();
        } else if (input.alt && input.key === 'ArrowRight' && canGoForward) {
            win.webContents.goForward();
            event.preventDefault();
        } else if ((input.control && input.key === 'r') || input.key === 'F5') {
            win.webContents.reload();
            event.preventDefault();
        }
    });

    win.webContents.on('context-menu', (event, params) => {
        const menuItems = [];

        const canGoBack = win.webContents.canGoBack();
        const canGoForward = win.webContents.canGoForward();

        menuItems.push({
            label: 'Back',
            enabled: canGoBack,
            click: () => { win.webContents.goBack(); }
        });
        menuItems.push({
            label: 'Forward',
            enabled: canGoForward,
            click: () => { win.webContents.goForward(); }
        });
        menuItems.push({
            label: 'Reload',
            click: () => { win.webContents.reload(); }
        });
        menuItems.push({ type: 'separator' });

        if (params.linkURL) {
            menuItems.push({
                label: 'Open Link in Browser',
                click: () => { shell.openExternal(params.linkURL); }
            });
            menuItems.push({ type: 'separator' });
        }

        menuItems.push({
            label: 'Open in Browser',
            click: () => {
                const currentUrl = win.webContents.getURL();
                if (currentUrl) {
                    shell.openExternal(currentUrl);
                }
            }
        });

        const menu = Menu.buildFromTemplate(menuItems);
        menu.popup({ window: win });
    });

    logger.info('WebApp navigation setup completed for window');
}

module.exports = {
    setupWebAppNavigation
};
