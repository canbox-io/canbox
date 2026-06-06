<template>
    <div class="settings-container">
        <!-- 基本设置 -->
        <div class="settings-group">
            <div class="group-title">
                <span class="group-icon">⚙️</span>
                <span>{{ $t('settings.basicGroup') || '基本设置' }}</span>
            </div>

            <!-- 开机自动启动 -->
            <div class="setting-item">
                <label class="setting-label">
                    <span class="setting-icon">🚀</span>
                    {{ $t('settings.autostart') }}
                </label>
                <div class="setting-control">
                    <el-switch v-model="autostartEnabled" @change="handleAutostartChange" />
                </div>
            </div>

            <!-- 语言 -->
            <div class="setting-item">
                <label class="setting-label">
                    <span class="setting-icon">🌐</span>
                    {{ $t('settings.language') }}
                </label>
                <div class="setting-control">
                    <el-select v-model="currentLanguage" @change="handleLanguageChange" class="setting-select">
                        <el-option v-for="lang in availableLanguages" :key="lang.code" :label="lang.name"
                            :value="lang.code" style="font-size: 16px;" />
                    </el-select>
                </div>
            </div>

            <!-- 字体 -->
            <div class="setting-item">
                <label class="setting-label">
                    <span class="setting-icon">🔤</span>
                    {{ $t('settings.font') }}
                </label>
                <div class="setting-control">
                    <el-select v-model="currentFont" @change="handleFontChange" class="setting-select">
                        <el-option v-for="font in availableFonts" :key="font.value" :label="font.label"
                            :value="font.value" style="font-size: 16px;" />
                    </el-select>
                </div>
            </div>

            <!-- 执行模式 -->
            <div class="setting-item">
                <label class="setting-label">
                    <span class="setting-icon">▶️</span>
                    {{ $t('settings.executionMode') }}
                </label>
                <div class="setting-control">
                    <el-select v-model="currentExecutionMode" @change="handleExecutionModeChange" class="setting-select">
                        <el-option v-for="mode in executionModes" :key="mode.value" :label="mode.label"
                            :value="mode.value" style="font-size: 16px;" />
                    </el-select>
                </div>
            </div>

            <!-- 缩放 -->
            <div class="setting-item">
                <label class="setting-label">
                    <span class="setting-icon">🔍</span>
                    {{ $t('settings.zoom') }}
                </label>
                <div class="setting-control">
                    <div class="zoom-control">
                        <span class="zoom-hint">Ctrl++ / Ctrl+- / Ctrl+0</span>
                        <div class="zoom-buttons">
                            <el-button @click="handleZoomMinus" :disabled="zoomStore.factor <= 0.5">-</el-button>
                            <span class="zoom-value">{{ zoomStore.factor.toFixed(1) }}</span>
                            <el-button @click="handleZoomPlus" :disabled="zoomStore.factor >= 2.0">+</el-button>
                            <el-button @click="handleZoomReset" :disabled="zoomStore.factor === 1.0">
                                {{ $t('settings.zoomReset') }}
                            </el-button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 快捷方式 -->
            <div class="setting-item">
                <label class="setting-label">
                    <span class="setting-icon">🔗</span>
                    {{ $t('settings.shortcutTitle') }}
                </label>
                <div class="setting-control">
                    <div class="button-group">
                        <el-button type="primary" @click="generateShortcut">
                            {{ $t('settings.createShortcut') }}
                        </el-button>
                        <el-button type="danger" @click="deleteShortcut">
                            {{ $t('settings.deleteShortcut') }}
                        </el-button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 数据路径 -->
        <div class="settings-group">
            <div class="group-title">
                <span class="group-icon">💾</span>
                <span>{{ $t('settings.dataPathGroup') || '数据路径' }}</span>
            </div>

            <!-- 当前路径信息 -->
            <div class="setting-item full-width">
                <el-descriptions :column="1" size="default" border class="path-descriptions">
                    <el-descriptions-item :label="$t('settings.currentDataPath')">
                        {{ currentDataPath }}
                    </el-descriptions-item>
                    <el-descriptions-item :label="$t('settings.diskUsage')">
                        {{ diskUsage }}
                    </el-descriptions-item>
                </el-descriptions>
            </div>

            <!-- 新路径选择 -->
            <div class="setting-item full-width">
                <div class="path-select-row">
                    <el-input v-model="newDataPath" :placeholder="$t('settings.customDataPathPlaceholder')"
                        style="flex: 1;" />
                    <el-button @click="selectDirectory">
                        {{ $t('settings.browse') }}
                    </el-button>
                </div>
            </div>

            <!-- 警告提示 -->
            <div class="setting-item full-width" v-if="newDataPath">
                <el-alert type="warning" :closable="false">
                    <template #title>
                        {{ $t('settings.customDataPathWarning') }}
                    </template>
                    <div class="warning-detail">
                        {{ $t('settings.customDataPathWarningDetail', { path: newDataPath + '/Users' }) }}
                    </div>
                </el-alert>
            </div>

            <!-- 操作按钮 -->
            <div class="setting-item full-width">
                <div class="button-group">
                    <el-button type="primary" @click="saveCustomDataPath" :disabled="!newDataPath || isSaving"
                        :loading="isSaving">
                        {{ isSaving ? $t('settings.migrating') : $t('settings.saveAndMigrate') }}
                    </el-button>
                    <el-button @click="resetToDefault" :disabled="isSaving">
                        {{ $t('settings.resetToDefault') }}
                    </el-button>
                </div>
            </div>
        </div>

        <!-- 日志设置 -->
        <div class="settings-group">
            <div class="group-title">
                <span class="group-icon">📝</span>
                <span>{{ $t('settings.logGroup') || '日志设置' }}</span>
            </div>

            <div class="setting-item">
                <label class="setting-label">
                    {{ $t('settings.logRetentionDays') }}
                </label>
                <div class="setting-control">
                    <el-input-number v-model="logRetentionDays" :min="0" :max="30" :step="1" controls-position="right"
                        style="width: 200px;" @change="saveLogRetentionDays" />
                    <el-tooltip :content="$t('settings.logRetentionDaysHint')" placement="top">
                        <span class="help-icon">?</span>
                    </el-tooltip>
                </div>
            </div>
        </div>

        <!-- 自动更新 -->
        <div class="settings-group">
            <div class="group-title">
                <span class="group-icon">🔄</span>
                <span>{{ $t('autoUpdate.settings.title') }}</span>
            </div>

            <div class="setting-item">
                <label class="setting-label">
                    {{ $t('autoUpdate.settings.enableAutoUpdate') }}
                </label>
                <div class="setting-control">
                    <el-switch v-model="updateConfig.enabled" @change="saveUpdateConfig" />
                </div>
            </div>

            <!-- 更新源 -->
            <div class="setting-item" :class="{ disabled: !updateConfig.enabled }">
                <label class="setting-label">
                    <span class="setting-icon">🌐</span>
                    {{ $t('autoUpdate.settings.updateSource') }}
                </label>
                <div class="setting-control update-source-control">
                    <el-radio-group v-model="updateSource" @change="handleUpdateSourceChange">
                        <el-radio value="auto" class="update-source-radio">
                            {{ $t('autoUpdate.settings.updateSourceAuto') }}
                            <span class="source-desc">{{ $t('autoUpdate.settings.updateSourceAutoDesc') }}</span>
                        </el-radio>
                        <el-radio value="github" class="update-source-radio">
                            {{ $t('autoUpdate.settings.updateSourceGithub') }}
                        </el-radio>
                        <el-radio value="mirror" class="update-source-radio">
                            {{ $t('autoUpdate.settings.updateSourceMirror') }}
                        </el-radio>
                    </el-radio-group>
                    <div class="current-source">
                        {{ $t('autoUpdate.settings.currentSource') }}: {{ currentSourceDisplay }}
                    </div>
                </div>
            </div>

            <div class="setting-item" :class="{ disabled: !updateConfig.enabled }">
                <label class="setting-label">
                    {{ $t('autoUpdate.settings.checkFrequency') }}
                </label>
                <div class="setting-control">
                    <el-select v-model="updateConfig.checkFrequency" @change="saveUpdateConfig" class="setting-select" :disabled="!updateConfig.enabled">
                        <el-option :label="$t('autoUpdate.settings.startup')" value="startup" style="font-size: 16px;" />
                        <el-option :label="$t('autoUpdate.settings.daily')" value="daily" style="font-size: 16px;" />
                        <el-option :label="$t('autoUpdate.settings.weekly')" value="weekly" style="font-size: 16px;" />
                        <el-option :label="$t('autoUpdate.settings.manual')" value="manual" style="font-size: 16px;" />
                    </el-select>
                </div>
            </div>

            <div class="setting-item" :class="{ disabled: !updateConfig.enabled }">
                <label class="setting-label">
                    {{ $t('autoUpdate.settings.lastCheckTime') }}
                </label>
                <div class="setting-control">
                    <span class="info-text">{{ formatLastCheckTime }}</span>
                </div>
            </div>

            <div class="setting-item">
                <div class="button-group">
                    <el-button :loading="isCheckingUpdate" @click="handleManualCheckUpdate" :disabled="!updateConfig.enabled">
                        {{ isCheckingUpdate ? $t('autoUpdate.checkingForUpdates') :
                            $t('autoUpdate.settings.manualCheckButton') }}
                    </el-button>
                    <el-button v-if="updateConfig.skippedVersions && updateConfig.skippedVersions.length > 0"
                        @click="handleClearSkipped" :disabled="!updateConfig.enabled">
                        {{ $t('autoUpdate.settings.clearSkipped') }} ({{ updateConfig.skippedVersions.length }})
                    </el-button>
                </div>
            </div>
        </div>

        <!-- 倒计时对话框 -->
        <RestartCountdownDialog v-model:visible="showRestartDialog" :isAppImage="restartIsAppImage"
            @restart-now="onRestartNow" />
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessageBox } from 'element-plus';
import notification from '../utils/notification';
import { useI18n } from 'vue-i18n';
import RestartCountdownDialog from './RestartCountdownDialog.vue';
import { useUpdateStore } from '@/stores/updateStore';
import { useZoomStore } from '@/stores/zoomStore';

const { t, locale } = useI18n();
const updateStore = useUpdateStore();
const zoomStore = useZoomStore();

const currentLanguage = ref('en-US');
const availableLanguages = ref([]);
const currentFont = ref('default');
const currentExecutionMode = ref('window');

// 缩放相关（使用 Pinia store）

// 日志查看器配置
const logRetentionDays = ref(30);

// 自动更新配置
const updateConfig = ref({
    enabled: true,
    checkOnStartup: true,
    checkFrequency: 'startup',
    autoDownload: false,
    autoInstall: 'ask',
    skippedVersions: []
});
const isCheckingUpdate = ref(false);

// 更新源相关
const updateSource = ref('auto');
const currentSource = ref('');

// 当前源显示文本
const currentSourceDisplay = computed(() => {
    if (currentSource.value === 'github') return 'GitHub';
    if (currentSource.value === 'mirror') return t('autoUpdate.settings.updateSourceMirror');
    if (currentSource.value === 'auto') return currentSource.value;
    return currentSource.value || '-';
});

// 自定义数据路径相关
const currentDataPath = ref('');
const diskUsage = ref('');
const newDataPath = ref('');
const isSaving = ref(false);
const autostartEnabled = ref(false);

// 倒计时对话框相关
const showRestartDialog = ref(false);
const restartIsAppImage = ref(false);

// 常用系统字体列表（使用 computed 响应语言变化）
const availableFonts = computed(() => [
    { label: t('settings.defaultFont'), value: 'default' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Microsoft YaHei (微软雅黑)', value: '"Microsoft YaHei", sans-serif' },
    { label: 'SimSun (宋体)', value: 'SimSun, serif' },
    { label: 'SimHei (黑体)', value: 'SimHei, sans-serif' },
    { label: 'Noto Sans CJK', value: '"Noto Sans CJK SC", sans-serif' },
    { label: 'Source Han Sans (思源黑体)', value: '"Source Han Sans CN", sans-serif' },
    { label: 'WenQuanYi Zen Hei (文泉驿正黑)', value: '"WenQuanYi Zen Hei", sans-serif' },
    { label: 'Liberation Sans', value: '"Liberation Sans", sans-serif' },
    { label: 'DejaVu Sans', value: '"DejaVu Sans", sans-serif' },
    { label: 'Ubuntu', value: 'Ubuntu, sans-serif' },
    { label: 'Roboto', value: 'Roboto, sans-serif' },
    { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", serif' },
    { label: 'Courier New', value: '"Courier New", monospace' }
]);

// 执行模式选项（使用 computed 响应语言变化）
const executionModes = computed(() => [
    { label: t('settings.executionModeWindow'), value: 'window' },
    { label: t('settings.executionModeChildprocess'), value: 'childprocess' }
]);

// 格式化最后检查时间
const formatLastCheckTime = computed(() => {
    const lastCheck = updateConfig.value.lastCheckTime;
    if (!lastCheck) return '-';

    const date = new Date(lastCheck);
    return date.toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
});

function generateShortcut() {
    window.api.generateShortcut(ret => {
        if (ret.success) {
            notification.success(t('settings.shortcutCreated'));
        } else {
            notification.error(ret.msg);
        }
    });
}

function deleteShortcut() {
    window.api.deleteShortcut(ret => {
        if (ret.success) {
            notification.success(t('settings.shortcutDeleted'));
        } else {
            notification.error(ret.msg);
        }
    });
}

async function handleLanguageChange(lang) {
    const result = await window.api.i18n.setLanguage(lang);
    if (!result.success) {
        notification.error(result.msg || 'Failed to change language');
        currentLanguage.value = await window.api.i18n.getLanguage();
    }
}

async function handleFontChange(fontValue) {
    const result = await window.api.font.set(fontValue);

    if (!result.success) {
        notification.error(result.msg || 'Failed to set font');
        return;
    }

    applyFont(fontValue);

    notification.success(t('settings.fontSetSuccess'));
}

async function handleExecutionModeChange(mode) {
    const result = await window.api.execution.setGlobalMode(mode);
    if (!result.success) {
        notification.error(result.msg || 'Failed to set execution mode');
        return;
    }
    notification.success(t('settings.executionModeSetSuccess'));
}

async function handleZoomPlus() {
    const newZoom = Math.min(2.0, Math.round((zoomStore.factor + 0.1) * 10) / 10);
    if (newZoom !== zoomStore.factor) {
        await zoomStore.set(newZoom);
    }
}

async function handleZoomMinus() {
    const newZoom = Math.max(0.5, Math.round((zoomStore.factor - 0.1) * 10) / 10);
    if (newZoom !== zoomStore.factor) {
        await zoomStore.set(newZoom);
    }
}

async function handleZoomReset() {
    await zoomStore.reset();
}

async function selectDirectory() {
    const result = await window.api.userData.selectDirectory();
    if (result.success) {
        newDataPath.value = result.path;
    }
}

async function saveCustomDataPath() {
    if (!newDataPath.value) {
        notification.error(t('settings.customDataPathPlaceholder'));
        return;
    }

    isSaving.value = true;
    try {
        const result = await window.api.userData.migrate(newDataPath.value);
        if (result.success) {
            restartIsAppImage.value = result.isAppImage;
            showRestartDialog.value = true;
            newDataPath.value = '';
        } else {
            notification.error(t('settings.migrationFailed', { error: result.error }));
        }
    } catch (error) {
        notification.error(t('settings.migrationFailed', { error: error.message }));
    } finally {
        isSaving.value = false;
    }
}

async function resetToDefault() {
    isSaving.value = true;
    try {
        const result = await window.api.userData.resetToDefault();
        if (result.success) {
            restartIsAppImage.value = result.isAppImage;
            showRestartDialog.value = true;
        } else {
            notification.error(t('settings.migrationFailed', { error: result.error }));
        }
    } catch (error) {
        notification.error(t('settings.migrationFailed', { error: error.message }));
    } finally {
        isSaving.value = false;
    }
}

async function onRestartNow() {
    try {
        const result = await window.api.userData.restartNow();
        if (result.success) {
            showRestartDialog.value = false;
        }
    } catch (error) {
        notification.error(t('settings.migrationFailed', { error: error.message }));
    }
}

async function saveLogRetentionDays() {
    const days = logRetentionDays.value;
    if (days < 0 || days > 30) {
        notification.error(t('settings.retentionDaysError'));
        logRetentionDays.value = await window.api.logViewer.getRetentionDays();
        return;
    }
    const result = await window.api.logViewer.setRetentionDays(days);
    if (result.success) {
        notification.success(t('settings.retentionDaysSaved'));
    } else {
        notification.error(result.msg || t('settings.retentionDaysSaveFailed'));
    }
}

async function loadUpdateConfig() {
    if (window.api && window.api.autoUpdate) {
        const result = await window.api.autoUpdate.getConfig();
        if (result.success && result.config) {
            updateConfig.value = {
                enabled: result.config.enabled ?? true,
                checkOnStartup: result.config.checkOnStartup ?? true,
                checkFrequency: result.config.checkFrequency ?? 'startup',
                autoDownload: result.config.autoDownload ?? false,
                autoInstall: result.config.autoInstall ?? 'ask',
                skippedVersions: result.config.skippedVersions ?? [],
                lastCheckTime: result.config.lastCheckTime ?? null
            };
        }
    }
}

async function saveUpdateConfig() {
    if (window.api && window.api.autoUpdate) {
        const configToSave = JSON.parse(JSON.stringify(updateConfig.value));
        const result = await window.api.autoUpdate.saveConfig(configToSave);
        if (result.success) {
            notification.success(t('common.success'));
        } else {
            notification.error(result.error || t('common.error'));
        }
    }
}

async function handleManualCheckUpdate() {
    try {
        isCheckingUpdate.value = true;
        updateStore.clearError();

        if (window.api && window.api.autoUpdate) {
            const result = await window.api.autoUpdate.checkForUpdate();

            if (result.success) {
                if (updateStore.hasUpdate) {
                    notification.success(t('autoUpdate.updateAvailable', { version: updateStore.updateInfo.version }));
                } else {
                    notification.info(t('autoUpdate.noUpdateAvailable'));
                }
            } else {
                notification.error(result.error?.message || t('autoUpdate.updateError'));
            }
        }
    } catch (error) {
        notification.error(t('autoUpdate.updateError'));
    } finally {
        isCheckingUpdate.value = false;
    }
}

async function handleClearSkipped() {
    try {
        const title = t('autoUpdate.settings.clearSkipped');
        const versionsList = updateConfig.value.skippedVersions.join('<br>');
        const message = `${t('autoUpdate.settings.clearSkippedConfirm')}<br><br><div style="font-family: monospace; line-height: 1.6;">${versionsList}</div>`;

        await ElMessageBox.confirm(
            message,
            title,
            {
                confirmButtonText: '确认',
                cancelButtonText: '取消',
                type: 'warning',
                dangerouslyUseHTMLString: true,
                closeOnClickModal: false,
                closeOnPressEscape: false
            }
        );

        const configToSave = JSON.parse(JSON.stringify({
            ...updateConfig.value,
            skippedVersions: []
        }));

        const result = await window.api.autoUpdate.saveConfig(configToSave);

        if (result.success) {
            updateConfig.value.skippedVersions = [];
            notification.success(t('common.success'));
        } else {
            notification.error(result.error || t('common.error'));
            await loadUpdateConfig();
        }
    } catch (error) {
        // 用户取消，不做任何操作
    }
}

async function handleAutostartChange(enabled) {
    const result = await window.api.autostart.set(enabled);
    if (result.success) {
        notification.success(t('settings.autostartSaved'));
    } else {
        // 失败时回滚
        autostartEnabled.value = !enabled;
        notification.error(result.error || t('common.error'));
    }
}

async function loadUpdateSource() {
    try {
        const result = await window.api.updateSource.get();
        if (result.success) {
            updateSource.value = result.source;
            currentSource.value = result.currentSource;
        }
    } catch (error) {
        console.error('Failed to load update source:', error);
    }
}

async function handleUpdateSourceChange(source) {
    try {
        const result = await window.api.updateSource.set(source);
        if (result.success) {
            currentSource.value = source;
            notification.success(t('autoUpdate.settings.sourceChanged', { source: source.toUpperCase() }));
        } else {
            notification.error(result.error || t('common.error'));
            // 恢复原值
            await loadUpdateSource();
        }
    } catch (error) {
        notification.error(t('common.error'));
        await loadUpdateSource();
    }
}

function onUpdateSourceChanged(event) {
    const { to } = event;
    updateSource.value = to;
    currentSource.value = to;
}

function applyFont(fontValue) {
    if (fontValue === 'default') {
        document.documentElement.style.fontFamily = '';
    } else {
        document.documentElement.style.fontFamily = fontValue;
    }
}

function onFontChanged(event, fontValue) {
    currentFont.value = fontValue;
    applyFont(fontValue);
}

async function loadSettings() {
    currentLanguage.value = await window.api.i18n.getLanguage();
    availableLanguages.value = await window.api.i18n.getAvailableLanguages();

    const savedFont = await window.api.font.get();
    currentFont.value = savedFont;
    applyFont(savedFont);

    const savedExecutionMode = await window.api.execution.getGlobalMode();
    currentExecutionMode.value = savedExecutionMode || 'window';

    // 初始化 zoom store（会在内部获取初始值并监听变化）
    await zoomStore.init();

    const pathResult = await window.api.userData.getCurrentPath();
    if (pathResult.success) {
        currentDataPath.value = pathResult.path;
    }

    const usageResult = await window.api.userData.getDiskUsage();
    if (usageResult.success) {
        diskUsage.value = usageResult.size;
    }

    logRetentionDays.value = await window.api.logViewer.getRetentionDays();

    await loadUpdateConfig();
    await loadUpdateSource();

    // 加载开机启动状态
    const autostartResult = await window.api.autostart.get();
    if (autostartResult.success) {
        autostartEnabled.value = autostartResult.enabled;
    }
}

onMounted(() => {
    loadSettings();
    window.api.on('font-changed', onFontChanged);
    window.api.on('update-source:changed', onUpdateSourceChanged);
});

onUnmounted(() => {
    window.api.off?.('font-changed', onFontChanged);
    window.api.off?.('update-source:changed', onUpdateSourceChanged);
});
</script>

<style scoped>
/* 设置容器 */
.settings-container {
    padding: 10px;
    height: 100%;
    overflow-y: auto;
}

/* 分组卡片 */
.settings-group {
    background: #ffffff;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.settings-group:last-child {
    margin-bottom: 0;
}

/* 分组标题 */
.group-title {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #303133;
}

.group-icon {
    font-size: 24px;
}

/* 设置项 - 水平布局 */
.setting-item {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
}

.setting-item:last-child {
    margin-bottom: 0;
}

/* 全宽设置项（无标签） */
.setting-item.full-width {
    display: block;
}

/* 禁用状态的设置项 */
.setting-item.disabled {
    opacity: 0.5;
    pointer-events: none;
}

/* 标签 */
.setting-label {
    font-size: 18px;
    color: #606266;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 120px;
    flex-shrink: 0;
}

.setting-icon {
    font-size: 18px;
}

/* 控件容器 */
.setting-control {
    flex: 1;
    min-width: 0;
    text-align: left;
}

/* 下拉框统一宽度 */
.setting-select {
    width: 200px;
}

/* 下拉框字体大小 */
:deep(.el-select__selection) {
    font-size: 16px;
}

:deep(.el-select-dropdown__item) {
    font-size: 16px;
}

/* 基本设置组 - 语言、字体、执行模式控件宽度一致 */
.settings-group:nth-child(1) .setting-control {
    width: 200px;
    flex-shrink: 0;
}

/* 数据路径描述 */
.path-descriptions :deep(.el-descriptions__label) {
    font-size: 18px;
}

.path-descriptions :deep(.el-descriptions__content) {
    font-size: 18px;
}

/* 日志保留天数数字 */
.log-days-input {
    width: 80px;
}

/* 缩放控制 */
.zoom-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.zoom-hint {
    font-size: 12px;
    color: #909399;
}

.zoom-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
}

.zoom-value {
    font-size: 16px;
    font-weight: 500;
    min-width: 40px;
    text-align: center;
}

/* 帮助问号图标 */
.help-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 25px;
    height: 25px;
    margin-left: 8px;
    background: #909399;
    color: #fff;
    border-radius: 50%;
    font-size: 18px;
    cursor: help;
}

/* Tooltip 字体大小 - 与 AppList 页面一致 */
:global(.el-tooltip__popper) {
    font-size: 14px !important;
}

/* 按钮组 */
.button-group {
    display: flex;
    gap: 10px;
    flex-wrap: nowrap;
}

/* 路径选择行 */
.path-select-row {
    display: flex;
    gap: 10px;
    align-items: center;
}

/* 提示文字 */
.setting-hint {
    margin-left: 10px;
    color: #909399;
    font-size: 15px;
}

/* 信息文字 */
.info-text {
    color: #909399;
    font-size: 16px;
}

/* 警告详情 */
.warning-detail {
    font-size: 14px;
    margin-top: 4px;
}

/* 清除跳过版本对话框样式 */
:deep(.clear-skipped-dialog) {
    .el-message-box__message {
        white-space: pre-wrap;
        line-height: 1.8;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 14px;
    }
}

/* 更新源控件样式 */
.update-source-control {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.update-source-radio {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 4px;
}

.update-source-radio .source-desc {
    font-size: 12px;
    color: #909399;
    margin-left: 24px;
    margin-top: 2px;
}

.current-source {
    margin-top: 8px;
    font-size: 14px;
    color: #606266;
}
</style>