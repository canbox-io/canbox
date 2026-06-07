import { createI18n } from 'vue-i18n';

const messages = {
    'zh-CN': () => import('../locales/zh-CN.json'),
    'en-US': () => import('../locales/en-US.json')
};

const i18n = createI18n({
    legacy: false, // 使用 Composition API 模式
    locale: 'zh-CN', // 默认语言
    fallbackLocale: 'zh-CN', // 回退语言
    messages: {}
});

/**
 * 加载语言包
 */
export async function loadMessages(locale) {
    console.log('[i18n] loadMessages:', locale);
    try {
        const loader = messages[locale];
        if (loader) {
            console.log('[i18n] dynamic import for:', locale);
            const loaded = await loader();
            console.log('[i18n] imported messages for:', locale, ', keys:', Object.keys(loaded).length);
            i18n.global.setLocaleMessage(locale, loaded);
            console.log('[i18n] setLocaleMessage done for:', locale);
            return true;
        }
        console.warn('[i18n] no loader found for locale:', locale);
        return false;
    } catch (error) {
        console.error(`[i18n] Failed to load messages for ${locale}:`, error);
        return false;
    }
}

/**
 * 初始化 i18n
 */
export async function initI18n() {
    console.log('[i18n] initI18n started');

    // 获取当前语言（从主进程或本地存储）
    let currentLang = 'zh-CN';

    // 尝试从主进程获取
    try {
        const lang = await window.api.i18n.getLanguage();
        if (lang) {
            currentLang = lang;
        }
    } catch (error) {
        console.warn('[i18n] Failed to get language from main process (expected in browser):', error.message);
    }

    console.log('[i18n] Loading messages for locale:', currentLang);
    // 加载当前语言和回退语言的消息
    await loadMessages(currentLang);
    if (currentLang !== 'zh-CN') {
        console.log('[i18n] Loading fallback messages for zh-CN');
        await loadMessages('zh-CN');
    }

    i18n.global.locale.value = currentLang;
    console.log('[i18n] i18n initialized with locale:', currentLang);

    // 监听语言变化事件（仅 Electron 环境可用）
    try {
        if (window.api) {
            window.api.on('language-changed', (event, lang) => {
                console.log(`Language changed to: ${lang}`);
                i18n.global.locale.value = lang;
                loadMessages(lang);
            });
        }
    } catch (error) {
        console.warn('Failed to register language-changed listener:', error.message);
    }
}

export default i18n;
