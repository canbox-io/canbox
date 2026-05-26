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
- 导出开始：`logger.info('Exporting app: {}, version: {}, saveTo: {}', appId, version, savePath)`
- 读取 asar 文件：`logger.info('Reading asar file: {}', asarPath)`
- 检测 unpacked 目录：`logger.info('Found .asar.unpacked directory: {}', unpackedPath)`
- 打包进度：`logger.info('Creating zip package...')`
- 导出成功：`logger.info('App exported successfully: {} -> {}', appId, savePath)`
- 导出失败：`logger.error('App export failed: {}, error: {}', appId, error.message)`

## 验收标准

- [ ] "我的 APP"页面每个 APP 卡片上显示"导出"按钮
- [ ] 点击导出按钮弹出系统保存对话框，默认文件名为 `{id}-{version}.zip`
- [ ] 打包过程后台执行，通过任务面板展示进度，不影响前台操作
- [ ] 导出的 zip 包包含 `.asar` 文件和 `.asar.unpacked` 目录（如果存在）
- [ ] 导出的 zip 包可通过"导入已有的 APP"功能正常安装
- [ ] 不含 `.asar.unpacked` 目录的 APP 导出后仍可正常导入
- [ ] 导出成功/失败均记录到操作历史，可在操作历史面板查看
- [ ] 导出流程关键节点有 log4js 日志输出
- [ ] 国际化文案完整（中英文）

## 实施计划

- [ ] 在 `modules/file-task/` 中新增 `app-export` 任务执行器，实现 asar + unpacked 打包为 zip 的逻辑
- [ ] 在 `modules/ipc/appManagerIpcHandler.js` 中新增 `export-app` IPC handler
- [ ] 在 `preload.js` 中暴露 `exportApp` 方法
- [ ] 在 `AppCard.vue` 中新增 `showExport` prop 和 `export` emit
- [ ] 在 `AppList.vue` 中处理 `export` 事件，调用 IPC 并创建任务
- [ ] 在 `src/utils/appIcons.js` 中添加 export 按钮图标
- [ ] 更新 `locales/zh-CN.json` 和 `locales/en-US.json`，新增导出相关文案（含操作历史消息）
