<template>
    <transition name="slide-up">
        <div v-if="showPanel" :class="['file-task-panel', { 'panel-collapsed': !panelExpanded }]">
            <!-- 收起状态：小图标按钮 -->
            <div v-if="!panelExpanded" class="collapsed-badge" @click="panelExpanded = true">
                <span class="badge-icon">📋</span>
                <span v-if="runningCount > 0" class="badge-dot"></span>
            </div>
            <!-- 展开状态：完整面板 -->
            <template v-else>
                <div class="panel-header">
                    <span class="panel-title">{{ $t('fileTask.title') }}</span>
                    <span class="panel-count">{{ $t('fileTask.taskCount', { count: activeTasks.length }) }}</span>
                    <div class="panel-actions">
                        <el-tooltip :content="$t('fileTask.cleanupOld')" placement="top">
                            <button class="icon-btn" @click="handleCleanupOld">🧹</button>
                        </el-tooltip>
                        <el-tooltip :content="$t('fileTask.clearCompleted')" placement="top">
                            <button class="icon-btn" @click="handleClearCompleted">🗑️</button>
                        </el-tooltip>
                        <el-tooltip :content="$t('fileTask.collapse')" placement="top">
                            <button class="icon-btn" @click="panelExpanded = false">▼</button>
                        </el-tooltip>
                    </div>
                </div>
                <div class="panel-body">
                    <div v-if="taskList.length === 0" class="empty-tip">
                        {{ $t('fileTask.empty') }}
                    </div>
                    <div
                        v-for="task in taskList"
                        :key="task.id"
                        :class="['task-item', `task-status-${task.status}`]"
                    >
                        <div class="task-info">
                            <span class="task-type-icon">{{ getTypeIcon(task.type) }}</span>
                            <span class="task-name">{{ task.options?.name || task.uid || task.id }}</span>
                            <el-tag
                                :type="getStatusTagType(task.status)"
                                size="small"
                                effect="plain"
                                class="task-status-tag"
                            >
                                {{ getStatusText(task.status) }}
                            </el-tag>
                        </div>
                        <div v-if="isRunningState(task.status)" class="task-progress">
                            <el-progress
                                :percentage="task.progress || 0"
                                :stroke-width="6"
                                :show-text="!!task.progressText"
                                :format="() => task.progressText || ''"
                            />
                            <span v-if="task.speed" class="task-speed">{{ task.speed }}</span>
                        </div>
                        <div v-if="task.error" class="task-error">
                            {{ task.error }}
                        </div>
                        <div class="task-actions">
                            <el-button
                                v-if="canCancel(task)"
                                type="warning"
                                size="small"
                                text
                                @click="handleCancel(task.id)"
                            >
                                {{ $t('common.cancel') }}
                            </el-button>
                            <el-button
                                v-if="canRetry(task)"
                                type="primary"
                                size="small"
                                text
                                @click="handleRetry(task.id)"
                            >
                                {{ $t('autoUpdate.retry') }}
                            </el-button>
                            <el-button
                                v-if="canDelete(task)"
                                type="danger"
                                size="small"
                                text
                                @click="handleDelete(task.id)"
                            >
                                {{ $t('fileTask.delete') }}
                            </el-button>
                        </div>
                    </div>
                </div>
            </template>
        </div>
    </transition>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFileTaskStore } from '@/stores/fileTaskStore';

const { t } = useI18n();
const fileTaskStore = useFileTaskStore();

const panelExpanded = ref(false);

const taskList = computed(() => fileTaskStore.taskList);
const activeTasks = computed(() => fileTaskStore.activeTasks);
const showPanel = computed(() => taskList.value.length > 0);
const runningCount = computed(() => taskList.value.filter(t => isRunningState(t.status)).length);

const TERMINAL_STATES = ['completed', 'cancelled', 'failed', 'interrupted'];

function isRunningState(status) {
    return !TERMINAL_STATES.includes(status);
}

function canCancel(task) {
    return ['pending', 'preparing', 'downloading', 'extracting', 'moving'].includes(task.status);
}

function canRetry(task) {
    return task.status === 'failed' || task.status === 'interrupted';
}

function canDelete(task) {
    return ['completed', 'cancelled', 'failed', 'interrupted'].includes(task.status);
}

function getTypeIcon(type) {
    const icons = {
        'app-import': '📥',
        'repo-download': '📦',
        'app-pack': '📦',
        'app-update': '🔄',
        'app-export': '📤',
    };
    return icons[type] || '📋';
}

function getStatusTagType(status) {
    const map = {
        'idle': 'info',
        'pending': 'info',
        'preparing': 'warning',
        'downloading': '',
        'extracting': 'warning',
        'moving': 'warning',
        'completed': 'success',
        'failed': 'danger',
        'cancelled': 'info',
        'interrupted': 'warning',
    };
    return map[status] || 'info';
}

function getStatusText(status) {
    if (!status) return '';
    const key = `fileTask.status.${status}`;
    const text = t(key);
    return text === key ? status : text;
}

async function handleCancel(taskId) {
    try {
        await window.api.fileTask.cancel(taskId);
    } catch (err) {
        console.error('[FileTaskPanel] cancel task failed:', err);
    }
}

async function handleRetry(taskId) {
    try {
        await window.api.fileTask.retry(taskId);
    } catch (err) {
        console.error('[FileTaskPanel] retry task failed:', err);
    }
}

function handleClearCompleted() {
    fileTaskStore.clearCompleted();
}

async function handleDelete(taskId) {
    await fileTaskStore.deleteTask(taskId);
}

async function handleCleanupOld() {
    await fileTaskStore.cleanupByDays(30);
}

function onTaskUpdate(task) {
    fileTaskStore.updateTask(task);
}

function onKeydown(e) {
    if (e.key === 'Escape' && panelExpanded.value) {
        panelExpanded.value = false;
    }
}

onMounted(async () => {
    document.addEventListener('keydown', onKeydown);

    if (!window.api?.fileTask) {
        console.warn('[FileTaskPanel] window.api.fileTask not available');
        return;
    }

    try {
        const result = await window.api.fileTask.getAll();
        if (result.success && result.tasks) {
            fileTaskStore.updateTasks(result.tasks);
        }
    } catch (err) {
        console.error('[FileTaskPanel] getAll tasks failed:', err);
    }

    window.api.fileTask.onUpdate(onTaskUpdate);
});

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);

    if (window.api?.fileTask) {
        window.api.fileTask.offUpdate(onTaskUpdate);
    }
});
</script>

<style scoped>
.file-task-panel {
    position: fixed;
    bottom: 12px;
    right: 12px;
    width: 380px;
    max-height: 400px;
    background: #fff;
    border: 1px solid #e4e7ed;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.25s ease, max-height 0.25s ease, border-radius 0.25s ease;
}

.file-task-panel.panel-collapsed {
    width: auto;
    max-height: none;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.collapsed-badge {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    position: relative;
    transition: transform 0.2s;
}

.collapsed-badge:hover {
    transform: scale(1.1);
}

.collapsed-badge:active {
    transform: scale(0.95);
}

.badge-icon {
    font-size: 22px;
    line-height: 1;
}

.badge-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    background: #67c23a;
    border-radius: 50%;
    border: 2px solid #fff;
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

.panel-header {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid #f0f0f0;
    background: #fafafa;
    flex-shrink: 0;
}

.panel-title {
    font-size: 14px;
    font-weight: 600;
    color: #303133;
}

.panel-count {
    margin-left: 8px;
    font-size: 12px;
    color: #909399;
}

.panel-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
}

.icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.icon-btn:hover {
    background-color: #f0f0f0;
}

.panel-body {
    overflow-y: auto;
    flex: 1;
    padding: 8px 0;
}

.empty-tip {
    text-align: center;
    padding: 20px;
    color: #909399;
    font-size: 13px;
}

.task-item {
    padding: 8px 14px;
    border-bottom: 1px solid #f5f5f5;
    transition: background-color 0.2s;
}

.task-item:last-child {
    border-bottom: none;
}

.task-item:hover {
    background-color: #fafafa;
}

.task-item.task-status-completed {
    opacity: 0.7;
}

.task-item.task-status-failed {
    background-color: #fef0f0;
}

.task-item.task-status-interrupted {
    background-color: #fdf6ec;
}

.task-info {
    display: flex;
    align-items: center;
    gap: 6px;
}

.task-type-icon {
    font-size: 14px;
}

.task-name {
    font-size: 13px;
    color: #303133;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.task-status-tag {
    flex-shrink: 0;
}

.task-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding-right: 0;
}

.task-progress .el-progress {
    flex: 1;
}

.task-speed {
    font-size: 11px;
    color: #909399;
    white-space: nowrap;
}

.task-error {
    margin-top: 4px;
    font-size: 12px;
    color: #f56c6c;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.task-actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 4px;
}

.slide-up-enter-active,
.slide-up-leave-active {
    transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
    transform: translateY(20px);
    opacity: 0;
}
</style>
