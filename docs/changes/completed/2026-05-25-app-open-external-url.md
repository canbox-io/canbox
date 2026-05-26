# app-open-external-url

## 概述
为 APP 提供外部链接使用默认浏览器打开的能力，包含自动拦截和显式 API 两层机制，同时更新 API 文档和类型声明。

## 核心设计

### 三层能力

1. **自动拦截 - `setWindowOpenHandler`**：拦截 `target="_blank"` / `window.open()`，一律用默认浏览器打开
2. **自动拦截 - `will-navigate`**：拦截同窗口内不同源的 http/https 导航，用默认浏览器打开；同源导航和 `file://` 协议导航放行
3. **显式 API - `canbox.openUrl(url)`**：APP 开发者在 JS 代码中主动调用，用默认浏览器打开

### 同源检查逻辑（`will-navigate`）

```
导航 URL 以 http:// 或 https:// 开头？
  → 否：放行（file:// 等内部导航不受影响）
  → 是：导航 URL 与当前页面同源？
    → 是：放行（开发模式 localhost 内页跳转不受影响）
    → 否：拦截，shell.openExternal() 用默认浏览器打开
```

### 与已有能力的关系

APP 如需在 Electron 窗口内打开 URL，使用已有的 `canbox.win.createWindow()`，与自动拦截互不冲突。

## 验收标准

- [x] APP 中点击 `<a href="https://...">` 链接，使用默认浏览器打开而非 Electron 窗口内导航
- [x] APP 中点击 `<a target="_blank" href="https://...">` 链接，使用默认浏览器打开
- [x] APP 内部导航（`file://` 协议、同源 `http://localhost`）不受影响，正常在窗口内跳转
- [x] `canbox.openUrl(url)` API 可正常调用，使用默认浏览器打开
- [x] `canbox.win.createWindow()` 仍可在 Electron 窗口内打开 URL，不受拦截影响
- [x] `types/canbox.d.ts` 已更新 `openUrl` 类型声明
- [x] `APP_DEV_CN.md` 和 `APP_DEV.md` 已更新 API 文档

## 实施计划

- [x] 在 `modules/main/api.js` 中新增 `msg-openUrl` IPC handler，调用 `shell.openExternal()`
- [x] 在 `modules/app.api.js` 的 `window.canbox` 上新增 `openUrl(url)` 方法
- [x] 在 `modules/core/win.js` 的 APP 子窗口创建时添加 `setWindowOpenHandler` + `will-navigate` 拦截
- [x] 在 `childprocessEntry.js` 的子进程模式 APP 窗口创建时添加同样的拦截逻辑
- [x] 更新 `types/canbox.d.ts`，新增 `openUrl` 类型声明
- [x] 更新 `docs/development/APP_DEV_CN.md`，补充 `openUrl` 用法和自动拦截行为说明
- [x] 更新 `docs/development/APP_DEV.md`，同上英文版

## 关键实现细节

- `setupExternalUrlHandler(win)` 函数在 `win.js` 和 `childprocessEntry.js` 中各有一份实现，逻辑完全一致，因为两者属于不同的进程环境
- `will-navigate` 拦截使用 `new URL().origin` 做同源比较，`URL` 构造函数解析失败时静默放行，避免异常阻断正常导航
- `setWindowOpenHandler` 对所有 URL 返回 `{ action: 'deny' }`，仅对 http/https URL 额外调用 `shell.openExternal()`
- `msg-openUrl` IPC 使用 `ipcMain.on` 同步模式，与项目中其他 APP IPC handler 风格保持一致

## 修改的文件

### 修改文件
```
- modules/main/api.js (引入 shell，新增 initOpenUrlIpcHandlers 处理 msg-openUrl)
- modules/app.api.js (新增 ipcSendOpenUrl、openUrl 方法，挂载到 window.canbox.openUrl)
- modules/core/win.js (引入 shell，新增 setupExternalUrlHandler，在 createWindow 中调用)
- childprocessEntry.js (引入 shell，新增 setupExternalUrlHandler，在 createAppWindow 中调用)
- types/canbox.d.ts (新增 openUrl: (url: string) => Promise<void> 类型声明)
- docs/development/APP_DEV_CN.md (新增「外部链接」章节)
- docs/development/APP_DEV.md (新增「External URLs」章节)
```
