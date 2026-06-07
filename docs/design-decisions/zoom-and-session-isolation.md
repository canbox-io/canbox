# Zoom 机制与会话隔离设计

> **状态：** 已实施
> **日期：** 2026-06-06
> **作者：** Canbox Team

## 1. 背景

Canbox 中存在三类窗口，各自对 zoom 的需求不同：

| 窗口类型 | Zoom 需求 | 配置来源 |
|----------|-----------|----------|
| **Canbox 主窗口** | 支持 Ctrl+滚轮 / Ctrl++- 缩放，范围 0.5~2.0，持久化 | `canbox.json` → `zoomFactor` |
| **APP 窗口**（普通 + WebApp） | 支持 Ctrl+滚轮缩放，持久化到 `winState`，可用 `app.json` 的 `window.zoomEnabled` 控制 | `winState` + `app.json` |
| **Launcher 窗口** | **始终 1.0**，不允许任何 zoom | 无（硬编码锁定） |

### Zoom 系统架构

```
Canbox 主窗口
    Ctrl+滚轮 → initZoomFeature() (src/main.js)
        → window.api.zoom.set() (preload.js)
            → ipcHandlers.js → canboxStore.set('zoomFactor')
                → mainWindow.webContents.setZoomFactor()
                → event.sender.send('zoom-changed')

APP 窗口
    Ctrl+滚轮 → setupAppZoom() (modules/web-app/app-zoom.js)
        → CSS zoom 属性 + 阅读 zoom 值持久化到 winState

Launcher 窗口
    ❌ 不参与任何 zoom 变更
    → src/main.js: 拦截 Ctrl+滚轮 / Ctrl++- 事件
    → launcherManager.js: did-finish-load 时锁定 zoom=1.0
```

## 2. 问题：Launcher 窗口 Zoom 被主窗口传染

### 现象

启动 Launcher 后，在主窗口按住 Ctrl 滚动滚轮，主窗口 zoom 变化的同时，**Launcher 窗口的 zoom 也随之变化**，即使 Launcher 窗口已在前端拦截了所有 Ctrl 相关事件。

### 根因分析

问题出在 **Chromium 底层的 `HostZoomMap`**。

**`HostZoomMap` 是 Chromium 内核中按「session + host」存储 zoom 级别的数据结构。** 当一个页面通过 Ctrl+滚轮改变 zoom 时，Chromium 会更新 `HostZoomMap` 中对应 host 的 zoom 值。同一 session 下、同一 host 的所有 webContents 都会自动继承这个 zoom 值。

问题的链路：

```
┌─────────────────────────────────────────────────────────────┐
│                   默认 Session (共享)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              HostZoomMap                              │  │
│  │  file:// → zoomFactor: 1.5  ←── Ctrl+滚轮 触发更新    │  │
│  └──────────────┬───────────────────┬───────────────────┘  │
│                 │                   │                      │
│  ┌──────────────▼────────┐  ┌──────▼────────────────────┐ │
│  │  主窗口 (file://)     │  │  Launcher (file://)       │ │
│  │  zoomFactor: 1.5 ✓    │  │  zoomFactor: 1.5 ✗        │ │
│  └───────────────────────┘  └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

关键发现：
- 两个窗口的 `webPreferences` 都**没有设置 `partition`**，因此共享默认 session
- 两个窗口加载内容来自同一 host（开发时 `http://localhost`，生产时 `file://`）
- `setVisualZoomLevelLimits(1, 1)` **只能限制触摸板捏合缩放**（pinch-to-zoom），管不到 Ctrl+滚轮
- `zoom-factor-changed` 事件尝试了但无效——因为 zoom 变化走的不是 Electron API 层面，而是 Chromium 内部 `HostZoomMap` 的同步

## 3. 解决方案：Session 分区隔离

### 方案对比

| 方案 | 原理 | 结果 |
|------|------|------|
| `setVisualZoomLevelLimits(1, 1)` | 限制捏合缩放范围 | ❌ 只限制 pinch-zoom，不管 Ctrl+滚轮 |
| 监听 `zoom-factor-changed` 强制拉回 | 事件驱动，zoom 偏离时立即纠正 | ❌ 事件未触发（HostZoomMap 同步不经过此路径） |
| **独立 `partition`** | 给 Launcher 自己的 session，`HostZoomMap` 完全隔离 | ✅ 从根本上隔离 |

### 实施

在 `modules/launcher/launcherManager.js` 的 `webPreferences` 中增加 `partition: 'launcher'`：

```javascript
webPreferences: {
    preload: path.join(__dirname, '../../preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    partition: 'launcher'  // 独立 session，HostZoomMap 完全隔离
}
```

**`partition: 'launcher'` 的含义：**
- 非持久化分区（不带 `persist:` 前缀），仅存在于内存中
- Launcher 窗口获得独立的 `HostZoomMap`，不与主窗口共享
- Launcher 所有数据通过 IPC 从主进程获取，不依赖 session 级别的 cookie/storage

### 修改后的架构

```
┌─────────────────────────┐       ┌──────────────────────────────┐
│   默认 Session (主窗口)  │       │  "launcher" Session (独立)    │
│  ┌───────────────────┐  │       │  ┌────────────────────────┐  │
│  │   HostZoomMap     │  │       │  │     HostZoomMap        │  │
│  │ file:// → 1.5     │  │       │  │ file:// → 1.0          │  │
│  └───────┬───────────┘  │       │  └──────────┬─────────────┘  │
│          │              │       │             │                │
│  ┌───────▼────────────┐ │       │  ┌──────────▼────────────┐  │
│  │ 主窗口 zoomFactor  │ │       │  │ Launcher zoomFactor   │  │
│  │ = 1.5 ✓ (独立)     │ │       │  │ = 1.0 ✓ (独立)        │  │
│  └────────────────────┘ │       │  └───────────────────────┘  │
└─────────────────────────┘       └──────────────────────────────┘
```

## 4. 涉及的修改文件

| 文件 | 修改内容 | 目的 |
|------|----------|------|
| `modules/launcher/launcherManager.js` | `webPreferences` 增加 `partition: 'launcher'` | **核心修复**：隔离 session，阻止 `HostZoomMap` 跨窗口同步 |
| `src/main.js` | Launcher 路由下拦截 `wheel`(Ctrl) + `keydown`(Ctrl++-) 事件 | 防止 Launcher 窗口内直接触发 zoom（前端侧防护） |
| `modules/launcher/launcherManager.js` | `did-finish-load` 时 `setZoomFactor(1.0)` + `setVisualZoomLevelLimits(1, 1)` | 加载完成后立即锁定 zoom（主进程侧兜底） |

## 5. 经验总结

### 适用于未来新增窗口的规则

**如果你要创建一个不应受主窗口 zoom 影响的独立窗口，必须：**

1. **设置独立 `partition`**（如 `partition: 'my-window'`）——这是最关键的，从 Chromium 层面隔离 `HostZoomMap`
2. **拦截前端 Ctrl 事件**（如果该窗口加载了 `src/main.js` 的 `initZoomFeature()`）
3. **在 `did-finish-load` 时锁定 zoom**——作为最后一道防线

### Session 分区选型

| 类型 | 写法 | 持久化 | 适用场景 |
|------|------|--------|----------|
| 非持久化（推荐多用） | `partition: 'name'` | 否，内存级 | 弹窗、启动器、临时窗口 |
| 持久化 | `partition: 'persist:name'` | 是，写磁盘 | 需要记住登录态的子窗口 |

### 常见误区

| 误区 | 事实 |
|------|------|
| `setVisualZoomLevelLimits(1, 1)` 能禁止 Ctrl+滚轮 zoom | ❌ 只能限制 pinch-to-zoom（触摸板捏合），不管键盘/鼠标 zoom |
| `zoom-factor-changed` 事件能捕获所有 zoom 变化 | ❌ Chromium `HostZoomMap` 的 session 级同步可能不经过此事件 |
| 不同 BrowserWindow 的 zoom 天然独立 | ❌ 同一 session + 同一 host → `HostZoomMap` 自动同步 |

---

*最后更新：2026-06-06*
