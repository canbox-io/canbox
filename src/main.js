import { createApp } from 'vue'
import './style.css'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { createPinia } from 'pinia'
import i18n, { initI18n } from './i18n'

console.log('[main.js] Script loaded, initializing app...');

const app = createApp(App)
const pinia = createPinia()

// 注册 Element Plus 图标组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}

app.use(ElementPlus).use(router).use(pinia).use(i18n)

// mount 应用的统一入口
function doMount() {
    if (mountCalled) return;
    mountCalled = true;
    const el = document.querySelector('#app');
    console.log('[main.js] Mounting app, #app element found:', !!el, ', innerHTML length:', el ? el.innerHTML.length : 'N/A');
    app.mount('#app');
    initZoomFeature();
}
let mountCalled = false;

// 兜底超时：5 秒后无论 i18n 是否完成都先 mount
const mountTimeout = setTimeout(() => {
    console.warn('[main.js] initI18n timeout after 5s, mounting app anyway');
    doMount();
}, 5000);

// 初始化 i18n 并等待完成后 mount 应用
initI18n().then(() => {
    console.log('[main.js] i18n loaded successfully');
    clearTimeout(mountTimeout);
    doMount();
}).catch(error => {
    console.error('[main.js] Failed to initialize i18n:', error);
    clearTimeout(mountTimeout);
    // 即使失败也要 mount 应用，避免白屏
    doMount();
});

// 全局缩放功能
function initZoomFeature() {
    // 浏览器环境或无 window.api 时跳过
    if (!window.api) {
        console.log('Zoom feature skipped: window.api not available');
        return;
    }

    // launcher 窗口不支持 zoom 变动，只拦截事件阻止 Chromium 原生 zoom
    if (window.location.hash === '#/launcher') {
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey) e.preventDefault();
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (!e.ctrlKey) return;
            if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0') {
                e.preventDefault();
            }
        });

        console.log('Zoom feature skipped: launcher window (events intercepted only)');
        return;
    }

    // 当前缩放比例
    let currentZoom = 1.0;

    // 从主进程获取当前缩放比例
    window.api.zoom.get().then(result => {
        if (result.success) {
            currentZoom = result.factor;
        }
    }).catch(err => {
        console.error('Failed to get zoom factor:', err);
    });

    // 调整缩放值的辅助函数
    function adjustZoom(delta) {
        let newZoom = currentZoom + delta;
        // 限制范围 0.5 - 2.0
        newZoom = Math.max(0.5, Math.min(2.0, newZoom));
        // 保留一位小数
        newZoom = Math.round(newZoom * 10) / 10;

        if (newZoom !== currentZoom) {
            currentZoom = newZoom;
            window.api.zoom.set(currentZoom).then(result => {
                if (result.success) {
                    console.log('Zoom factor set to:', currentZoom);
                }
            }).catch(err => {
                console.error('Failed to set zoom factor:', err);
            });
        }
    }

    // 监听滚轮事件 (Ctrl + 滚轮)
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            adjustZoom(delta);
        }
    }, { passive: false });

    // 监听键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey) return;

        // Ctrl++ / Ctrl+= → zoom+0.1
        if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            adjustZoom(0.1);
        }
        // Ctrl+- → zoom-0.1
        else if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            adjustZoom(-0.1);
        }
        // Ctrl+0 → reset to 1.0
        else if (e.key === '0') {
            e.preventDefault();
            if (currentZoom !== 1.0) {
                currentZoom = 1.0;
                window.api.zoom.set(1.0).then(result => {
                    if (result.success) {
                        console.log('Zoom factor reset to 1.0');
                    }
                }).catch(err => {
                    console.error('Failed to reset zoom factor:', err);
                });
            }
        }
    });

    console.log('Zoom feature initialized (Ctrl+Wheel / Ctrl++/-/0)');
}
