<template>
    <div class="about-container">
        <div class="about-content">
            <!-- 顶部区域：Logo 和 信息并列 -->
            <div class="top-section">
                <div class="logo-section">
                    <img :src="logoPath" alt="Canbox Logo" class="logo" />
                    <h1>{{ t('app.title') }}</h1>
                </div>

                <div class="info-section">
                    <p><strong>{{ t('about.description') }}:</strong> {{ packageDescription }}</p>
                    <p><strong>{{ t('about.author') }}:</strong> {{ packageAuthor }}</p>
                    <p><strong>{{ t('about.license') }}:</strong> {{ packageLicense }}</p>
                    <div class="version-line">
                        <span><strong>{{ t('about.version') }}:</strong> {{ packageVersion }}</span>
                        <!-- 有更新且已下载完成：显示安装按钮 -->
                        <el-button
                            v-if="isDownloaded && !hasError"
                            type="success"
                            size="small"
                            @click="handleInstallUpdate"
                            class="upgrade-button"
                        >
                            <el-icon><Download /></el-icon>
                            {{ t('autoUpdate.restartToUpdate') }}
                        </el-button>
                        <!-- 有更新（未下载/下载中）：显示升级按钮 -->
                        <el-button
                            v-else-if="hasUpdate && !hasError"
                            type="primary"
                            size="small"
                            @click="handleUpgrade"
                            class="upgrade-button"
                        >
                            <el-icon><Top /></el-icon>
                            {{ isDownloading ? t('autoUpdate.viewProgress') : t('autoUpdate.upgrade') }}
                        </el-button>
                        <!-- 有错误或正常状态：显示检查更新按钮 -->
                        <el-button
                            v-if="!hasUpdate || hasError"
                            :loading="isCheckingUpdate"
                            size="small"
                            @click="handleCheckUpdate"
                            class="check-button"
                        >
                            <el-icon><Refresh /></el-icon>
                            {{ isCheckingUpdate ? t('autoUpdate.checkingForUpdates') : t('autoUpdate.checkForUpdates') }}
                        </el-button>
                    </div>
                    <!-- 下载进度条（关闭弹层后在此查看） -->
                    <div v-if="isDownloading" class="about-download-progress">
                        <div class="download-status">
                            <el-icon class="is-loading"><Loading /></el-icon>
                            <span>{{ t('autoUpdate.downloading') }}</span>
                            <span class="download-percent">{{ updateStore.downloadProgress.toFixed(0) }}%</span>
                        </div>
                        <el-progress
                            :percentage="updateStore.downloadProgress"
                            :stroke-width="8"
                            :show-text="false"
                        />
                        <div class="download-size-text">{{ updateStore.formattedDownloadSize }}</div>
                    </div>
                </div>
            </div>

            <!-- 错误提示区域 -->
            <el-alert
                v-if="hasError"
                type="warning"
                :title="errorDisplay.title"
                :description="errorDisplay.message"
                show-icon
                :closable="false"
                class="error-alert"
            >
                <template #default>
                    <p class="error-hint">{{ errorDisplay.hint }}</p>
                    <div class="error-actions">
                        <el-button
                            type="primary"
                            size="small"
                            @click="handleRetryUpdate"
                        >
                            {{ t('autoUpdate.retry') }}
                        </el-button>
                        <el-button
                            size="small"
                            @click="handleManualDownload"
                        >
                            {{ t('autoUpdate.manualDownload') }}
                        </el-button>
                    </div>
                </template>
            </el-alert>

            <el-divider />

            <div class="system-info">
                <span class="system-value">Node {{ nodeVersion }}</span>
                <span class="system-separator">|</span>
                <span class="system-value">Chrome {{ chromeVersion }}</span>
                <span class="system-separator">|</span>
                <span class="system-value">Electron {{ electronVersion }}</span>
            </div>

            <el-divider />

            <div class="links-section">
                <el-button type="primary" @click="openGithub">
                    <el-icon><Link /></el-icon>
                    {{ t('about.githubRepo') }}
                </el-button>
                <el-button @click="openLicense">
                    <el-icon><Document /></el-icon>
                    {{ t('about.viewLicense') }}
                </el-button>
            </div>
        </div>
        <div class="bottom-spacer"></div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Link, Document, Top, Refresh, Download, Loading } from '@element-plus/icons-vue';
import { useUpdateStore } from '@/stores/updateStore';
import { formatErrorForDisplay } from '@/utils/errorMessages';
import notification from '../utils/notification';
import logo from '/logo.png';

const { t } = useI18n();
const updateStore = useUpdateStore();

// 检查更新的加载状态
const isCheckingUpdate = ref(false);

// 检查是否有更新
const hasUpdate = computed(() => updateStore.hasUpdate);

// 检查是否有错误
const hasError = computed(() => updateStore.hasError);

// 下载相关状态
const isDownloading = computed(() => updateStore.isDownloading);
const isDownloaded = computed(() => {
  return updateStore.hasUpdate
    && updateStore.updateInfo?.downloaded
    && !updateStore.isDownloading;
});

// 格式化错误信息用于显示
const errorDisplay = computed(() => {
    if (!updateStore.errorInfo) {
        return {
            title: t('autoUpdate.errors.default.title'),
            message: '',
            hint: ''
        };
    }
    return formatErrorForDisplay(updateStore.errorInfo, t.locale);
});

const packageVersion = ref('');
const packageDescription = ref('');
const packageAuthor = ref('');
const packageLicense = ref('');
const logoPath = ref(logo);

// 版本信息
const nodeVersion = ref('');
const chromeVersion = ref('');
const electronVersion = ref('');

onMounted(async () => {
    // 获取 package.json 信息
    try {
        const result = await window.api.getAppInfo();
        if (result.success) {
            packageVersion.value = result.info.version;
            packageDescription.value = result.info.description;
            packageAuthor.value = result.info.author;
            packageLicense.value = result.info.license;
        } else {
            console.error('Failed to get app info:', result.error);
        }
    } catch (error) {
        console.error('Failed to load package.json:', error);
    }

    // 获取系统版本信息
    try {
        const versions = await window.api.getVersions();
        nodeVersion.value = versions.node;
        chromeVersion.value = versions.chrome;
        electronVersion.value = versions.electron;
    } catch (error) {
        console.error('Failed to get versions:', error);
    }
});

const openGithub = () => {
    window.api.openUrl('https://github.com/rexlevin/canbox');
};

const openGitee = () => {
    window.api.openUrl('https://gitee.com/rexlevin/canbox');
};

const openLicense = async () => {
    // 直接打开 GitHub 上的许可证文件
    window.api.openUrl('https://github.com/rexlevin/canbox/blob/main/LICENSE');
};

// 处理升级按钮点击
const handleUpgrade = () => {
    // 发送事件给主进程，触发更新对话框
    if (window.api) {
        window.api.send('show-update-dialog');
    }
};

// 处理检查更新按钮点击
const handleCheckUpdate = async () => {
    try {
        isCheckingUpdate.value = true;
        
        // 清除之前的错误状态
        updateStore.clearError();

        // 重新触发更新检查
        if (window.api && window.api.autoUpdate) {
            const result = await window.api.autoUpdate.checkForUpdate();
            
            if (result.success) {
                // 检查成功，根据结果显示提示
                if (updateStore.hasUpdate) {
                    // 有新版本，不显示提示，"升级"按钮会自动显示
                } else {
                    // 已经是最新版本
                    notification.info(t('autoUpdate.noUpdateAvailable'));
                }
            } else {
                console.error('[About.vue] 检查更新失败:', result.error);
                notification.error(result.error?.message || t('autoUpdate.updateError'));
            }
        }
    } catch (error) {
        console.error('[About.vue] 检查更新异常:', error);
        notification.error(t('autoUpdate.updateError'));
    } finally {
        isCheckingUpdate.value = false;
    }
};

// 处理重试更新
const handleRetryUpdate = async () => {
    try {
        // 清除错误状态
        updateStore.clearError();

        // 重新触发更新检查
        if (window.api && window.api.autoUpdate) {
            const result = await window.api.autoUpdate.checkForUpdate();
            if (!result.success) {
                console.error('[About.vue] 重试更新检查失败:', result.error);
            }
        }
    } catch (error) {
        console.error('[About.vue] 重试更新异常:', error);
    }
};

// 处理安装更新（已下载完成时）
const handleInstallUpdate = async () => {
    try {
        if (window.api && window.api.autoUpdate) {
            await window.api.autoUpdate.installUpdate();
        }
    } catch (error) {
        console.error('[About.vue] 安装更新失败:', error);
        notification.error(t('autoUpdate.updateError'));
    }
};

// 处理手动下载
const handleManualDownload = () => {
    // 跳转到 GitHub Releases latest
    window.api.openUrl('https://github.com/rexlevin/canbox/releases/latest');
};
</script>

<style scoped>
.about-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.about-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    text-align: center;
}

/* 顶部并列区域 */
.top-section {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 40px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.logo-section {
    text-align: center;
}

.logo {
    width: 128px;
    height: 128px;
    margin-bottom: 12px;
}

.logo-section h1 {
    font-size: 28px;
    margin: 0 0 8px 0;
    color: #303133;
}

.version {
    font-size: 16px;
    color: #909399;
    margin: 5px 0;
}

.upgrade-button {
    display: flex;
    align-items: center;
    gap: 5px;
}

.check-button {
    display: flex;
    align-items: center;
    gap: 5px;
}

.info-section {
    text-align: left;
    min-width: 320px;
    padding-top: 8px;
}

.info-section p {
    margin: 12px 0;
    font-size: 18px;
    color: #606266;
}

.info-section strong {
    color: #303133;
}

.version-line {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    font-size: 18px;
    color: #606266;
}

.version-line .el-button {
    font-size: 15px;
    padding: 8px 16px;
    height: auto;
}

.about-download-progress {
    margin-top: 14px;
    padding: 12px 16px;
    background: #f0f9ff;
    border: 1px solid #b3d8ff;
    border-radius: 8px;
    text-align: left;
}

.download-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 15px;
    color: #303133;
}

.download-percent {
    font-weight: 600;
    color: #409eff;
    margin-left: auto;
}

.download-size-text {
    margin-top: 6px;
    font-size: 12px;
    color: #909399;
    text-align: right;
}

.system-info {
    text-align: center;
    margin: 15px 0;
    padding: 14px;
    background: #f5f7fa;
    border-radius: 6px;
    font-size: 16px;
}

.system-value {
    color: #909399;
    font-family: monospace;
}

.system-separator {
    color: #dcdfe6;
    margin: 0 8px;
}

.links-section {
    margin-top: 30px;
    display: flex;
    justify-content: center;
    gap: 15px;
    flex-wrap: wrap;
}

.links-section .el-button {
    display: flex;
    align-items: center;
    gap: 5px;
}

.bottom-spacer {
    height: 20px;
}

.error-alert {
    margin: 20px 0;
    text-align: left;
}

.error-alert .el-alert__description {
    font-size: 14px;
}

.error-hint {
    margin: 10px 0;
    color: #E6A23C;
    font-size: 13px;
}

.error-actions {
    margin-top: 10px;
    display: flex;
    gap: 10px;
}
</style>
