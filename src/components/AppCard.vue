<template>
    <div class="app-card">
        <!-- Logo -->
        <div class="logo-section">
            <img :src="logoUrl" @click="$emit('show-info', uid)" :alt="app.name" />
        </div>

        <!-- 信息区域 -->
        <div class="info-section">
            <div class="name-row">
                <span class="app-name" @click="$emit('show-info', uid)">{{ app.name }}</span>
                <!-- 导入标记 -->
                <el-tag v-if="app.sourceTag === 'import'" size="small" type="info" effect="dark" class="import-tag">
                    {{ $t('appList.importTag') }}
                </el-tag>
                <span class="app-version">{{ app.version }}</span>
                <span v-if="app.author" class="author">
                    <span class="author-icon">👤</span>
                    <span class="author-name">{{ app.author }}</span>
                </span>
                <!-- 平台 - 靠右排列 -->
                <span v-if="platforms.length > 0" class="platforms-in-name">
                    <el-tooltip v-for="plat in platforms" :key="plat" :content="getPlatformName(plat)" placement="top" popper-class="app-card-tooltip">
                        <span class="platform-icon" v-html="getPlatformIconSvg(plat)"></span>
                    </el-tooltip>
                </span>
            </div>
            <div class="description">{{ app.description }}</div>
            <div class="bottom-row">
                <div class="meta-row">
                    <!-- 分类 -->
                    <template v-if="categories.length > 0">
                        <el-tooltip v-for="cat in categories" :key="cat" :content="getCategoryName(cat)"
                            placement="top" popper-class="app-card-tooltip">
                            <span class="meta-icon category-icon">{{ getCategoryIcon(cat) }}</span>
                        </el-tooltip>
                    </template>

                    <!-- 标签 -->
                    <el-tooltip v-if="allTagsTooltip" :content="allTagsTooltip" placement="top" popper-class="app-card-tooltip">
                        <span class="tags">{{ displayTags }}</span>
                    </el-tooltip>
                    <span v-else-if="displayTags" class="tags">{{ displayTags }}</span>
                </div>

                <!-- 功能按钮 - 靠右排列 -->
                <div class="actions-row">
                    <!-- 自定义操作按钮 slot -->
                    <slot name="actions" :app="app" :uid="uid">
                        <!-- 打包按钮（开发模式） -->
                        <el-tooltip v-if="showPack" :content="$t('appList.pack')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn pack-btn" @click="$emit('pack', uid)">
                                {{ getActionIcon('pack') }}
                            </button>
                        </el-tooltip>

                        <!-- 运行按钮 -->
                        <el-tooltip v-if="showRun" :content="$t('appList.run')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn run-btn" @click="$emit('run', uid)">
                                {{ getActionIcon('run') }}
                            </button>
                        </el-tooltip>

                        <!-- 清空数据按钮 -->
                        <el-tooltip v-if="showClear" :content="$t('appList.clearData')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn clear-btn" @click="$emit('clear', uid)">
                                {{ getActionIcon('clear') }}
                            </button>
                        </el-tooltip>

                        <!-- 打开数据目录按钮 -->
                        <el-tooltip v-if="showOpenDataDir" :content="$t('appList.openDataDir')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn open-data-dir-btn" @click="$emit('open-data-dir', uid)">
                                {{ getActionIcon('openDataDir') }}
                            </button>
                        </el-tooltip>

                        <!-- 导出按钮（我的APP） -->
                        <el-tooltip v-if="showExport" :content="$t('appList.exportApp')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn export-btn" @click="$emit('export', uid)">
                                {{ getActionIcon('export') }}
                            </button>
                        </el-tooltip>

                        <!-- 复制按钮（仓库） -->
                        <el-tooltip v-if="showCopy" :content="$t('appList.copy')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn copy-btn" @click="$emit('copy', uid)">
                                {{ getActionIcon('copy') }}
                            </button>
                        </el-tooltip>

                        <!-- 下载按钮（仓库） -->
                        <el-tooltip v-if="showDownload" :content="$t('appList.download')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn download-btn" @click="$emit('download', uid)">
                                {{ getActionIcon('download') }}
                            </button>
                        </el-tooltip>

                        <!-- 更新按钮（仓库） -->
                        <el-tooltip v-if="showUpdate" :content="$t('appList.update')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn update-btn" @click="$emit('update', uid)">
                                {{ getActionIcon('update') }}
                            </button>
                        </el-tooltip>

                        <!-- 已下载状态（仓库） -->
                        <el-tooltip v-if="showDownloaded" :content="$t('appList.downloaded')" placement="top" popper-class="app-card-tooltip">
                            <span class="icon-btn disabled">{{ getActionIcon('downloaded') }}</span>
                        </el-tooltip>

                        <!-- 删除按钮 -->
                        <el-tooltip v-if="showDelete" :content="$t('appList.removeApp')" placement="top" popper-class="app-card-tooltip">
                            <button class="icon-btn delete-btn" @click="$emit('delete', uid)">
                                {{ getActionIcon('delete') }}
                            </button>
                        </el-tooltip>
                    </slot>
                </div>
            </div>
        </div>

        <!-- Loading 遮罩层 -->
        <div v-if="loading" class="loading-overlay">
            <el-icon class="is-loading" :size="32">
                <Loading />
            </el-icon>
            <span class="loading-text">{{ loadingText || $t('common.loading') }}</span>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElIcon } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
    getCategoryIcon,
    getCategoryName,
    getPlatformIcon,
    getPlatformName,
    getPlatformIconSvg,
    getActionIcon
} from '@/utils/appIcons.js'

const { t: $t } = useI18n()

const props = defineProps({
    app: {
        type: Object,
        required: true,
        default: () => ({
            name: '',
            version: '',
            description: '',
            logo: '',
            platform: [],
            categories: [],
            tags: [],
            author: ''
        })
    },
    uid: {
        type: String,
        required: true
    },
    // 控制显示哪些按钮
    showPack: {
        type: Boolean,
        default: false
    },
    showRun: {
        type: Boolean,
        default: true
    },
    showClear: {
        type: Boolean,
        default: true
    },
    showExport: {
        type: Boolean,
        default: false
    },
    showOpenDataDir: {
        type: Boolean,
        default: false
    },
    showDelete: {
        type: Boolean,
        default: true
    },
    showCopy: {
        type: Boolean,
        default: false
    },
    showDownload: {
        type: Boolean,
        default: false
    },
    showUpdate: {
        type: Boolean,
        default: false
    },
    showDownloaded: {
        type: Boolean,
        default: false
    },
    // 加载状态
    loading: {
        type: Boolean,
        default: false
    },
    loadingText: {
        type: String,
        default: ''
    }
})

defineEmits(['run', 'delete', 'clear', 'pack', 'copy', 'download', 'update', 'export', 'show-info', 'open-data-dir'])

// Logo URL
const logoUrl = computed(() => {
    if (!props.app.logo) return ''
    return props.app.logo.startsWith('file://')
        ? props.app.logo
        : `file://${props.app.logo}`
})

// 分类列表
const categories = computed(() => {
    return props.app.categories || []
})

// 平台列表
const platforms = computed(() => {
    return props.app.platform || []
})

// 显示前2个标签，更多用...表示
const displayTags = computed(() => {
    const tags = props.app.tags
    if (!tags || tags.length === 0) return ''

    if (tags.length <= 2) {
        return tags.map(t => `#${t}`).join(' ')
    }

    return tags.slice(0, 2).map(t => `#${t}`).join(' ') + ' ...'
})

// tooltip显示全部标签
const allTagsTooltip = computed(() => {
    const tags = props.app.tags
    if (!tags || tags.length <= 2) return ''
    return tags.map(t => `#${t}`).join(' ')
})
</script>

<style scoped>
.app-card {
    background: #f5f7fa;
    border-radius: 10px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    padding: 20px;
    display: flex;
    align-items: flex-start;
    transition: box-shadow 0.2s;
    height: 100%;
    box-sizing: border-box;
    position: relative;
}

.app-card:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

/* Logo 区域 */
.logo-section {
    flex-shrink: 0;
}

.logo-section img {
    width: 88px;
    height: 88px;
    border-radius: 14px;
    cursor: pointer;
    object-fit: cover;
}

/* 信息区域 */
.info-section {
    flex: 1;
    margin-left: 20px;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.name-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.name-row .platforms-in-name {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
}

.name-row .import-tag {
    flex-shrink: 0;
    font-size: 12px;
}

.name-row .platform-icon {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.85;
    cursor: help;
    color: #606266;
}

.name-row .platform-icon :deep(svg) {
    width: 100%;
    height: 100%;
}

.app-name {
    font-size: 25px;
    font-weight: 600;
    color: #303133;
    cursor: pointer;
}

.app-name:hover {
    color: #409eff;
}

.app-version {
    color: #606266;
    font-size: 17px;
}

.author {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #303133;
    font-size: 15px;
}

.author-icon {
    font-size: 15px;
}

.author-name {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.description {
    color: #303133;
    font-size: 17px;
    margin-top: 8px;
    line-height: 1.6;
    text-align: left;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
}

/* 底部行 - 包含meta和按钮 */
.bottom-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
}

.meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.meta-icon {
    font-size: 21px;
    cursor: help;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.category-icon {
    background: #f5f7fa;
    border-radius: 4px;
    padding: 2px 4px;
}

.tags {
    color: #303133;
    font-size: 17px;
    cursor: help;
}

/* 功能按钮行 - 靠右排列 */
.actions-row {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
}

.icon-btn {
    width: 44px;
    height: 44px;
    border: none;
    background: #ebeff5;
    border-radius: 8px;
    cursor: pointer;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
    line-height: 1;
}

.icon-btn:hover {
    background: #dde3eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.icon-btn:active {
    transform: translateY(0);
}

.icon-btn.disabled {
    cursor: not-allowed;
    opacity: 0.6;
    background: #f0f2f5;
}

/* 按钮类型样式 */
.run-btn:hover {
    background: #e8f5e9;
}

.delete-btn:hover {
    background: #ffebee;
}

.clear-btn:hover {
    background: #fff3e0;
}

.open-data-dir-btn:hover {
    background: #e0f2f1;
}

.export-btn:hover {
    background: #e8eaf6;
}

.pack-btn:hover {
    background: #e3f2fd;
}

.download-btn:hover {
    background: #e8f5e9;
}

.update-btn:hover {
    background: #e3f2fd;
}

/* Tooltip 字体大小调整 */
:global(.app-card-tooltip) {
    font-size: 14px !important;
}

:global(.app-card-tooltip .el-popper__arrow::before) {
    font-size: 14px !important;
}

/* Loading 遮罩层 */
.loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(2px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    z-index: 10;
    border-radius: 8px;
    transition: all 0.3s ease;
}

.loading-text {
    font-size: 14px;
    color: #606266;
    font-weight: 500;
}
</style>
