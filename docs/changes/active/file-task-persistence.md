# file-task-persistence

## 概述

为文件任务管理器增加 PouchDB 持久化存储，解决重启后任务丢失和浮窗不显示的问题。新增 `interrupted` 状态标记中断任务，支持 30 天内记录的用户手动清理。

## 核心设计

### 1. 持久化存储层

新建 `modules/core/fileTaskDb.js`，参照 `canboxDb.js` 模式，独立 PouchDB 实例，存储路径通过 `pathManager.getFileTaskDbPath()` 获取，即 `{UsersPath}/db/fileTask/`。

**持久化数据结构**：

```javascript
{
    _id: 'task_{nanoid}',
    _rev: '...',
    taskId: 'repo-download-xxx-1234567890',
    type: 'repo-download',
    uid: 'xxx',
    status: 'completed',
    progress: 100,
    progressText: 'Completed',
    error: null,
    createdAt: 1234567890,
    startedAt: 1234567890,
    completedAt: 1234567890,
    options: { name: '...' },
    timestamp: 1234567890,
    createTime: '2026-05-27 10:00:00',
    updateTime: '2026-05-27 10:05:00',
}
```

### 2. 写入时机

| 时机 | 操作 | 说明 |
|------|------|------|
| `createTask` | `put` 新文档 | 任务创建 |
| `updateStatus` | `put` 更新文档 | 状态变更 |
| `completeTask` | `put` 更新文档 | 任务完成 |
| `failTask` | `put` 更新文档 | 任务失败 |
| `cancelTask` | `put` 更新文档 | 任务取消 |
| `clearCompleted` | `bulkRemove` | 用户批量清理 |
| 用户单个删除 | `remove` | 单条删除 |
| 用户全部清理 | `bulkRemove` | 全部清理 |

**不持久化**：`updateProgress`（瞬态数据，重启后无意义）、`speed`（瞬态）、`tempPath`（完成后已清理）。

### 3. 新增状态 `interrupted`

在 `file-task-state.js` 中新增 `INTERRUPTED: 'interrupted'` 状态，用于标记重启时处于运行中状态的任务。

**启动恢复逻辑**：

```
启动 → 从 PouchDB allDocs 加载所有任务
     → 遍历任务，将 running 状态（pending/preparing/downloading/extracting/moving）标记为 interrupted
     → 更新 PouchDB 中对应文档
     → 加载到 FileTaskManager.tasks Map
     → 推送到前端
```

### 4. 浮窗显示逻辑

当前 `showPanel` 仅在 `taskList.length > 0` 时显示。持久化后，重启时从 PouchDB 恢复任务到 Map，前端 `onMounted` 调用 `getAll()` 拿到历史任务，浮窗自然出现。

### 5. 30 天清理策略

- 不自动清理，由用户手动操作
- 提供 `cleanupByDays(30)` 方法
- UI 上提供"清理 30 天前记录"按钮
- 支持单个删除、批量删除（已完成/已失败）、全部清理

## 验收标准

- [ ] Canbox 重启后，文件任务浮窗自动出现，显示重启前的任务记录
- [ ] 重启前处于运行中的任务，重启后标记为 `interrupted` 状态
- [ ] 新建/状态变更/完成/失败/取消任务时，数据正确写入 PouchDB
- [ ] 用户可单个删除、批量清理已完成任务、全部清理任务记录
- [ ] 30 天前的记录可通过"清理"按钮手动删除，不会自动清理
- [ ] `updateProgress` 不触发持久化写入，不影响下载性能
- [ ] 现有任务流程（下载、导入、打包、导出、更新）功能正常，无回归

## 实施计划

- [ ] 重构 `modules/main/pathManager.js`：`getCanboxDbPath()` 改名为 `getHistoryDbPath()`，新增 `getFileTaskDbPath()`
- [ ] 同步修改 `modules/core/canboxDb.js` 中对 `getCanboxDbPath` 的调用为 `getHistoryDbPath`
- [ ] 新建 `modules/core/fileTaskDb.js`，实现 PouchDB 持久化层（put/get/find/remove/allDocs/bulkRemove/cleanupByDays）
- [ ] 修改 `modules/file-task/file-task-state.js`，新增 `INTERRUPTED` 状态
- [ ] 修改 `modules/file-task/file-task-manager.js`，在关键时机调用 fileTaskDb 持久化，新增 `loadPersistedTasks()` 启动恢复方法
- [ ] 修改 `modules/file-task/file-task-ipc.js`，新增清理相关 IPC handler（单个删除、批量清理、按天清理）
- [ ] 修改 `preload.js`，暴露新增的 fileTask IPC 接口
- [ ] 修改 `src/stores/fileTaskStore.js`，增加清理操作 actions
- [ ] 修改 `src/components/FileTaskPanel.vue`，增加清理 30 天前记录按钮，支持 interrupted 状态展示
- [ ] 修改国际化文件，新增 interrupted 状态文案和清理按钮文案
- [ ] 在主进程启动流程中调用 `loadPersistedTasks()`
- [ ] 综合测试：重启恢复、清理操作、各任务类型流程
