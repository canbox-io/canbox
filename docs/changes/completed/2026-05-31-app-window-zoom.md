# app-window-zoom

## 概述

为所有 APP 窗口（webapp 和普通 APP）提供缩放能力，支持 Ctrl+鼠标滚轮 和 Ctrl++/Ctrl+-/Ctrl+0 快捷键，**缩放结果持久化存储**，下次启动时自动恢复。通过 `app.json` 的 `window.zoomEnabled` 字段控制开启/关闭，默认开启。

## 核心设计

### 1. 缩放参数（与 Canbox 主窗口一致）

| 参数 | 值 |
|------|-----|
| 缩放步进 | 0.1 |
| 缩放范围 | 0.5 ~ 2.0 |
| Ctrl+0 | 重置到 1.0 |

### 2. 快捷键

| 操作 | 快捷键 |
|------|--------|
| 放大 | Ctrl++ / Ctrl+= |
| 缩小 | Ctrl+- |
| 重置 | Ctrl+0 |
| 滚轮缩放 | Ctrl+鼠标滚轮（上滚+0.1，下滚-0.1） |

### 3. app.json 配置开关

位置：`window.zoomEnabled`，类型 `boolean`，默认 `true`。

```json
{
    "window": {
        "zoomEnabled": false,
        "width": 1280,
        "height": 800
    }
}
```

设为 `false` 时 APP 窗口不启用任何缩放能力。

### 4. 实现方式

**缩放注入**（方案 1）：
- 在 `did-finish-load` 时通过 `webContents.executeJavaScript` 注入缩放脚本
- 脚本自行监听 keydown 和 wheel 事件，使用 CSS `zoom` 实现缩放
- 零 IPC 依赖，适用于 webapp 和普通 APP

**持久化存储**：
- 存储位置：`winState`（与窗口位置/大小持久化同一机制）
- 保存时机：
  - **退出保存**：`close` 事件时使用最后一次已知 zoom 值同步写入
  - **运行时保存**：每 3 秒轮询 `window.__canboxCurrentZoom`，变更时写入 winState
- 恢复时机：窗口创建时从 `winState.loadSync(uid)?.zoomFactor` 读取

**为什么不用 `window.canbox.store`？**
- APP 窗口配置了 `contextIsolation: true`，preload 世界的 `window.canbox` 对页面世界的注入脚本不可见
- 改用主进程侧 `executeJavaScript` 读取 zoom 值，绕开 context isolation 限制

### 5. 影响范围

- **新建** `modules/web-app/app-zoom.js`：封装 `setupAppZoom()`、`getCurrentZoom()`、`startZoomPersistence()` 函数
- **修改** `modules/integrated/appWindowManager.js`：读取/保存 `zoomFactor`，调用 zoom 设置和持久化
- **修改** `childprocessEntry.js`：同上
- **修改** `docs/development/APP_DEV.md` 和 `APP_DEV_CN.md`：新增 `zoomEnabled` 字段说明

## 验收标准

- [x] Ctrl+滚轮 / Ctrl++ / Ctrl+- / Ctrl+0 在所有 APP 窗口中正常工作
- [x] 缩放步进为 0.1，范围 0.5~2.0，Ctrl+0 重置到 1.0
- [x] 修改 zoom 后关闭 APP 再重新打开，zoom 恢复到退出时的值
- [x] APP 运行期间修改 zoom，崩溃/杀进程后重新打开，恢复到最后一次持久化的值
- [x] `app.json` 设置 `window.zoomEnabled: false` 后快捷键和滚轮均不生效
- [x] `app.json` 不设置 `zoomEnabled` 时默认启用缩放
- [x] 普通 APP（本地 HTML）和 webapp（外部 URL）均正常工作
- [x] 文档更新完整（中英文 APP_DEV 文档）

## 实施计划

- [x] 新建 `modules/web-app/app-zoom.js`，实现 `setupAppZoom(appWin, enableZoom)` 函数（基础缩放）
- [x] 修改 `modules/integrated/appWindowManager.js`：读取 `appJson.window.zoomEnabled`（默认 `true`），调用 `setupAppZoom`
- [x] 修改 `childprocessEntry.js`：同上
- [x] 更新 `docs/development/APP_DEV.md`：添加 `zoomEnabled` 字段说明
- [x] 更新 `docs/development/APP_DEV_CN.md`：同上
- [x] 修改 `modules/web-app/app-zoom.js`：增加 `getCurrentZoom()`、`startZoomPersistence()`，支持初始 zoom 传入
- [x] 修改 `modules/integrated/appWindowManager.js`：读取/持久化 `zoomFactor`，启动运行时轮询保存
- [x] 修改 `childprocessEntry.js`：同上
