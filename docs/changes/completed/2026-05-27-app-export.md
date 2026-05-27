# app-export

## 概述
在"我的 APP"页面为每个 APP 添加"导出"功能按钮，将已安装的 APP 打包为 zip 文件供用户离线分享，与"导入已有的 APP"功能形成闭环。

## 核心设计

### 导出流程

1. 用户点击 APP 卡片上的"导出"按钮
2. 弹出系统保存对话框，默认文件名 `{id}-{version}.zip`（如 `com.gitee.lizl6.cb-jsonbox-0.0.3.zip`）
3. 用户确认保存位置后，创建 `app-export` 任务，后台执行打包
4. 打包进度通过 FileTaskManager 任务系统反馈到前端任务面板
5. 完成后通知用户

### zip 包内容

- `{uid}.asar`（必须）
- `{uid}.asar.unpacked/`（如果存在）

zip 内的文件名使用 uid 而非 appJson.id，因为导入逻辑 `importAppFromZip` 按 uid 重命名 asar 文件。zip 文件名使用 `{id}-{version}.zip` 便于用户识别。

### 与导入的兼容性

导入逻辑 `importAppFromZip` 已正确处理 `.asar` 和 `.asar.unpacked` 的重命名和移动，导出的 zip 包结构与导入预期完全兼容。

### 操作历史记录

导出完成后，使用 `canboxDb.put()` 记录操作历史，与现有的下载、删除等操作保持一致：
- `type`: `'success'`
- `message`: `operationHistory.messages.appExportSuccess`
- `params`: `{ appName, version }`
- `module`: `'app'`
- `details`: `{ appId, version, exportPath }`

导出失败时同样记录：
- `type`: `'error'`
- `message`: `operationHistory.messages.appExportFailed`
- `params`: `{ appName, error }`

### 日志记录

在导出流程的关键节点使用 `log4js` 记录日志，便于问题排查：
- 导出开始：`logger.info('Exporting app: {}, saveTo: {}', uid, savePath)`
- 读取 asar 文件：`logger.info('Reading asar file: {}', asarPath)`
- 检测 unpacked 目录：`logger.info('Found .asar.unpacked directory: {}', unpackedPath)`
- 打包进度：`logger.info('Creating zip package: {}', savePath)`
- 导出成功：`logger.info('App exported successfully: {} -> {}', appId, savePath)`
- 导出失败：`logger.error('App export failed: {}, error: {}', uid, error.message)`

## 验收标准

- [x] "我的 APP"页面每个 APP 卡片上显示"导出"按钮
- [x] 点击导出按钮弹出系统保存对话框，默认文件名为 `{id}-{version}.zip`
- [x] 打包过程后台执行，通过任务面板展示进度，不影响前台操作
- [x] 导出的 zip 包包含 `.asar` 文件和 `.asar.unpacked` 目录（如果存在）
- [x] 导出的 zip 包可通过"导入已有的 APP"功能正常安装
- [x] 不含 `.asar.unpacked` 目录的 APP 导出后仍可正常导入
- [x] 导出成功/失败均记录到操作历史，可在操作历史面板查看
- [x] 导出流程关键节点有 log4js 日志输出
- [x] 国际化文案完整（中英文）

## 实施计划

- [x] 在 `modules/file-task/` 中新增 `APP_EXPORT` 任务类型和临时路径映射
- [x] 在 `modules/ipc/appManagerIpcHandler.js` 中新增 `handleAppExportTask` 函数、`export-app` 和 `select-export-path` IPC handler、注册 `app-export` 执行器
- [x] 在 `preload.js` 中暴露 `exportApp` 和 `selectExportPath` 方法
- [x] 在 `AppCard.vue` 中新增 `showExport` prop、`export` emit、导出按钮和样式
- [x] 在 `AppList.vue` 中传入 `show-export`、监听 `@export`、新增 `exportApp` 函数
- [x] 在 `src/utils/appIcons.js` 中添加 export 按钮图标（📤）和名称
- [x] 更新 `locales/zh-CN.json` 和 `locales/en-US.json`，新增导出相关文案（含操作历史消息）

## 实际修改文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `modules/file-task/file-task-state.js` | 修改 | 新增 `APP_EXPORT: 'app-export'` 任务类型 |
| `modules/file-task/file-path.js` | 修改 | `app-export` 映射到 `getAppTempPath()` |
| `modules/ipc/appManagerIpcHandler.js` | 修改 | 新增 `handleAppExportTask` 函数、`export-app` 和 `select-export-path` IPC handler、注册 `app-export` 执行器 |
| `preload.js` | 修改 | 暴露 `exportApp(uid, savePath)` 和 `selectExportPath(defaultName)` |
| `src/components/AppCard.vue` | 修改 | 新增 `showExport` prop、`export` emit、导出按钮和 hover 样式 |
| `src/components/AppList.vue` | 修改 | 传入 `:show-export="true"`、监听 `@export`、新增 `exportApp` 函数 |
| `src/components/FileTaskPanel.vue` | 修改 | 新增 `app-export` 图标映射（📤）、收起状态改为小图标、`getStatusText` 防御 undefined |
| `src/utils/appIcons.js` | 修改 | 新增 `export` 图标和名称 |
| `locales/zh-CN.json` | 修改 | 新增 `exportApp`、`exportSuccess`、`exportFailed`、`appExportSuccess`、`appExportFailed` |
| `locales/en-US.json` | 修改 | 同上英文版 |

## 关键实现细节

- zip 打包使用系统命令：Linux/macOS 使用 `zip -r`，Windows 使用 PowerShell `Compress-Archive`
- 操作 asar 文件本身时使用 `originalFs`（`originalFs.copyFileSync`），符合项目 ASAR 注意事项
- `.asar.unpacked` 目录使用 `fse.copySync` 复制
- 任务面板收起状态从 header 条改为 44×44 圆形小图标，解决遮挡列表底部内容的问题
