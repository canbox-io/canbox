<template>
    <div class="launcher-overlay" @click.self="handleOverlayClick">
        <div class="launcher-window" :style="windowStyle">
            <!-- 搜索框 -->
            <div class="search-area">
                <span class="search-icon">🔍</span>
                <input
                    ref="searchInput"
                    v-model="query"
                    class="search-input"
                    :placeholder="searchPlaceholder"
                    :style="{ fontSize: config.fontSize + 'px' }"
                    @input="handleInput"
                    autofocus
                />
                <span class="shortcut-hint" v-if="!query">Esc</span>
            </div>

            <!-- 搜索结果 -->
            <div class="results-area" v-if="filteredApps.length > 0">
                <div
                    v-for="(app, index) in filteredApps"
                    :key="app.id"
                    class="result-item"
                    :class="{ selected: index === selectedIndex }"
                    @click="launchApp(app)"
                    @mouseenter="selectedIndex = index"
                >
                    <img
                        class="app-icon"
                        :src="iconCache[app.id] || defaultAppIcon"
                        :alt="app.name"
                        @error="handleIconError"
                    />
                    <div class="app-info">
                        <span class="app-name" :style="{ fontSize: config.fontSize + 'px' }">
                            {{ app.name }}
                        </span>
                        <span class="app-comment" v-if="app.comment">
                            {{ app.comment }}
                        </span>
                    </div>
                    <span class="app-source" v-if="app.source === 'canbox'">📦</span>
                    <span class="enter-hint" v-if="index === selectedIndex">⏎</span>
                </div>
            </div>

            <!-- 无结果 -->
            <div class="results-area no-results" v-else-if="query && filteredApps.length === 0">
                <div class="empty-text">{{ $t('launcher.noResults') }}</div>
            </div>

            <!-- 默认提示（无输入时） -->
            <div class="results-area hint-area" v-else>
                <div class="hint-text">输入关键词搜索应用</div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// 默认应用图标（内联 SVG base64）
function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes));
}
const defaultAppIcon = 'data:image/svg+xml;base64,' + toBase64(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="12" fill="#e5e7eb"/>' +
    '<text x="32" y="42" text-anchor="middle" font-size="32" fill="#9ca3af">📦</text>' +
    '</svg>'
);

const { t } = useI18n();

// 搜索输入
const query = ref('');
const searchInput = ref(null);
const selectedIndex = ref(0);

// 应用列表（无输入时展示前5个）
const allApps = ref([]);
// 搜索结果（有输入时由主进程搜索填充）
const filteredApps = ref([]);

// 图标缓存 (app.id → base64 data URI)
const iconCache = ref({});

// 配置
const config = ref({
    width: 600,
    fontSize: 16,
    borderRadius: 12
});

const searchPlaceholder = computed(() => t('launcher.searchPlaceholder'));

const windowStyle = computed(() => ({
    width: config.value.width + 'px',
    height: '320px',
    borderRadius: config.value.borderRadius + 'px'
}));

/**
 * 监听输入变化，触发主进程搜索
 */
watch(query, async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
        // 无输入时展示前5个应用
        filteredApps.value = allApps.value.slice(0, 5);
        return;
    }
    // 有输入时通过 IPC 调用主进程 appSearchEngine 搜索
    try {
        const result = await window.api.launcher.searchApps(trimmed, 5);
        if (result.success) {
            filteredApps.value = result.data;
        }
    } catch (e) {
        console.error('[Launcher] 搜索失败:', e);
    }
}, { immediate: false });

/**
 * 加载单个应用图标（通过 IPC 获取 base64）
 */
async function loadAppIcon(app) {
    if (iconCache.value[app.id] !== undefined) return;
    const iconPath = app.iconPath;
    if (!iconPath) {
        iconCache.value[app.id] = defaultAppIcon;
        return;
    }
    // 浏览器环境无 window.api 时直接使用默认图标
    if (!window.api) {
        iconCache.value[app.id] = defaultAppIcon;
        return;
    }
    try {
        const result = await window.api.launcher.getAppIcon(iconPath);
        iconCache.value[app.id] = result.success ? result.data : defaultAppIcon;
    } catch (e) {
        iconCache.value[app.id] = defaultAppIcon;
    }
}

/**
 * 图标加载失败回退
 */
function handleIconError(event) {
    event.target.src = defaultAppIcon;
}

/**
 * 处理键盘事件
 */
function handleKeydown(event) {
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            selectedIndex.value = Math.min(selectedIndex.value + 1, filteredApps.value.length - 1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
            break;
        case 'Enter':
            event.preventDefault();
            if (filteredApps.value.length > 0 && selectedIndex.value >= 0) {
                launchApp(filteredApps.value[selectedIndex.value]);
            }
            break;
        case 'Escape':
            event.preventDefault();
            hideLauncher();
            break;
    }
}

/**
 * 处理输入变化
 */
function handleInput() {
    // 输入变化时重置选中索引
    selectedIndex.value = 0;
}

/**
 * 启动应用（将 Vue 响应式对象转为普通对象，避免 IPC 序列化问题）
 */
async function launchApp(app) {
    try {
        // 用展开运算符将 Vue 响应式对象转为普通对象
        await window.api.launcher.launchApp({ ...app });
    } catch (error) {
        console.error('[Launcher] 启动应用失败:', error);
    } finally {
        hideLauncher();
    }
}

/**
 * 隐藏启动器
 */
function hideLauncher() {
    window.api.launcher.hide();
    resetState();
}

/**
 * 点击遮罩层
 */
function handleOverlayClick() {
    hideLauncher();
}

/**
 * 重置状态
 */
function resetState() {
    query.value = '';
    selectedIndex.value = 0;
}

/**
 * 加载应用列表
 */
async function loadApps() {
    try {
        const result = await window.api.launcher.getAllApps();
        if (result.success) {
            allApps.value = result.data;
        }
    } catch (error) {
        console.error('[Launcher] 加载应用列表失败:', error);
    }
}

/**
 * 加载配置
 */
async function loadConfig() {
    try {
        const result = await window.api.launcher.getConfig();
        if (result.success && result.data) {
            config.value = { ...config.value, ...result.data };
        }
    } catch (error) {
        console.error('[Launcher] 加载配置失败:', error);
    }
}

// 当应用列表变化时预加载所有图标
watch(allApps, (apps) => {
    apps.forEach(app => loadAppIcon(app));
}, { deep: false });

onMounted(async () => {
    // 注册全局键盘事件（解决 Esc 必须 focus input 的问题）
    document.addEventListener('keydown', handleKeydown);

    // 浏览器环境 fallback：无 window.api 时仍可渲染
    if (window.api) {
        await loadConfig();
        await loadApps();

        // 监听窗口显示事件（每次显示时重置状态）
        window.api.launcher.onShown(() => {
            resetState();
            nextTick(() => {
                if (searchInput.value) {
                    searchInput.value.focus();
                }
            });
        });
    }

    // 自动获取焦点
    await nextTick();
    if (searchInput.value) {
        searchInput.value.focus();
    }
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
});
</script>

<style>
/* Launcher 运行在独立 transparent BrowserWindow 中，
   覆盖 style.css 的全局灰色背景，让窗口透明区域真正透出桌面 */
html, body {
    background-color: transparent !important;
}
</style>

<style scoped>
.launcher-overlay {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 0;
    text-align: left;
    overflow: visible;
}

.launcher-window {
    background: #ffffff;
    border: 1.5px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.25), 0 0 40px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    margin-top: 0;
    display: flex;
    flex-direction: column;
}

/* 搜索区域 */
.search-area {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
    gap: 10px;
}

.search-icon {
    font-size: 18px;
    flex-shrink: 0;
    opacity: 0.5;
}

.search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: #333;
    padding: 4px 0;
    font-family: inherit;
}

.search-input::placeholder {
    color: #bbb;
}

.shortcut-hint {
    font-size: 12px;
    color: #ccc;
    background: #f5f5f5;
    padding: 2px 8px;
    border-radius: 4px;
    flex-shrink: 0;
}

/* 结果区域 */
.results-area {
    flex: 1;
    padding: 8px 0;
    overflow-y: auto;
    min-height: 0;
}

/* 隐藏结果区域的滚动条 */
.results-area::-webkit-scrollbar {
    width: 0;
    height: 0;
}

.results-area.no-results {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    padding: 24px 16px;
}

.empty-text {
    color: #bbb;
    font-size: 15px;
}

.hint-area {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60px;
    padding: 16px;
}

.hint-text {
    color: #999;
    font-size: 14px;
}

/* 结果项 */
.result-item {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    gap: 12px;
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.result-item:hover,
.result-item.selected {
    background-color: #f5f7fa;
}

.app-icon {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    flex-shrink: 0;
    object-fit: contain;
}

.app-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.app-name {
    color: #333;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.app-comment {
    font-size: 12px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.app-source {
    font-size: 14px;
    flex-shrink: 0;
    opacity: 0.6;
}

.enter-hint {
    font-size: 11px;
    color: #bbb;
    background: #f5f5f5;
    padding: 1px 6px;
    border-radius: 3px;
    flex-shrink: 0;
}
</style>
