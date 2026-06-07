# launcher-app-cache

## 概述

为 Launcher 建立后台应用缓存服务，解决 Alt+Space 启动后因同步 I/O 阻塞导致 5 秒以上无响应的问题，实现"打开即用"。

## 核心设计

### 架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Main Process                                 │
│                                                                     │
│  LauncherAppCacheService          LauncherManager                    │
│  (modules/services/              (modules/launcher/                  │
│   launcherAppCacheService.js)     launcherManager.js)               │
│  ┌───────────────────────┐      ┌─────────────────────────────┐   │
│  │ • scanAll()           │      │ • show()                   │   │
│  │ • updateCache()       │◄────│ • hide()                   │   │
│  │ • startPeriodicScan() │      │ • IPC: getAllApps          │   │
│  │ • onStartup()         │      │ • IPC: searchApps          │   │
│  │ • fs.watch 监听       │      │ • IPC: launchApp           │   │
│  └──────────┬────────────┘      └────────────┬────────────────┘   │
│             │                                 │                     │
│             ▼                                 │                     │
│  ┌───────────────────────────────────┐        │                     │
│  │  LauncherAppsStore (electron-store)        │                     │
│  │  file: Users/launcher-apps.json            │                     │
│  │  { version, lastScanTime,                  │                     │
│  │    defaultAppIds, apps: [...] }            │                     │
│  └───────────────────────────────────┘        │                     │
│                                                  │                     │
│             ┌──────────────────────────────────┘                     │
│             ▼                                                          │
│  IPC: 'launcher:apps-updated' ──► Launcher Renderer                   │
│                                                                     │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    Launcher Renderer Process                          │
│                                                                     │
│  launcherStore.js (Pinia)          Launcher.vue                      │
│  ┌──────────────────────────┐     ┌─────────────────────────────┐   │
│  │ state:                   │     │ • 从 store 读取 apps        │   │
│  │   apps: ref([])          │────│ • 搜索输入立刻有结果         │   │
│  │   defaultAppIds: ref([]) │     │ • 默认列表立刻展示          │   │
│  │   isLoading: ref(false)  │     │ • 空数据时隐藏列表区         │   │
│  │ actions:                 │     └─────────────────────────────┘   │
│  │   loadFromCache()        │                                         │
│  │   search(query)          │                                         │
│  └──────────────────────────┘                                         │
│         ▲                                                             │
│         └── IPC: 'launcher:apps-updated'                              │
└──────────────────────────────────────────────────────────────────────┘
```

#### 控制流

```
# Canbox 启动
main.js init
    └── LauncherAppCacheService.onStartup()
            └── scanAll()（异步，不阻塞启动）
                    ├── 遍历 4 个 applications 目录收集 .desktop 文件
                    ├── 遍历图标主题目录构建 Map<iconName, fullPath>
                    ├── 调用 systemAppReader.parseDesktopFile() 解析
                    ├── O(1) 查找 iconPath
                    ├── diff 已有缓存
                    └── 写入 launcher-apps.json
        └── 注册 fs.watch（4 个目录，1s 防抖）
        └── 启动 node-cron（每小时全量兜底）

# Launcher 打开（Alt+Space）
LauncherManager.show()
    └── 渲染端 Launcher.vue onMounted
            ├── useLauncherStore.loadFromCache()
            │       └── IPC launcher:getAllApps → 读 electron-store（同步，毫秒级）
            ├── apps 有数据 → 展示列表区，搜索立即可用
            └── apps 为空 → 隐藏列表区

# 用户安装/卸载应用
fs.watch 事件 → 1s 防抖 → 增量扫描 → 写入 electron-store
    └── 若 Launcher 窗口打开
            └── win.webContents.send('launcher:apps-updated', apps)
                    └── 渲染端 silent 替换 Pinia store → 列表自动刷新

# 用户选中已删除应用
IPC launchApp → 检查 .desktop 文件是否存在
    ├── 存在 → 正常启动
    └── 不存在 → 返回 { success: false, reason: 'app-removed' }
            └── 前端从列表中移除 → 触发缓存刷新
```

### 模块归属：`modules/services/launcherAppCacheService.js`

新文件，与 `repoMonitorService.js` 并列，`main.js` 启动时注册。

### systemAppReader.js 重构：降级为纯函数 parser

保留 `parseDesktopFile()`、`parseExec()` 等解析函数，移除 `getSystemApplications()` 和 `resolveIconPath()`。

### 图标路径优化：建索引代替逐个递归

每次 scan 时：遍历图标主题目录 → 构建 `Map<iconName, fullPath>`（去重，≈0.4~1 MB）→ O(1) 查找每个 app 的图标路径。Map 是局部变量，用完即弃，不会 OOM。

### 变更检测

| 机制 | 职责 |
|------|------|
| `fs.watch` 监听 4 个目录 | 即时感知新增/删除，1 秒防抖后触发增量扫描 |
| 定时全量扫描（每小时） | 兜底，防止 fs.watch 遗漏 |

监听目录：`/usr/share/applications/`、`~/.local/share/applications/`、Flatpak 的两个 exports 目录。

### 缓存数据格式（`launcher-apps.json`）

```json
{
  "version": 1,
  "lastScanTime": 1717800000000,
  "defaultAppIds": ["firefox.desktop", "gedit.desktop", ...],
  "apps": [
    {
      "id": "firefox.desktop",
      "name": "Firefox",
      "exec": "/usr/bin/firefox %u",
      "icon": "firefox",
      "iconPath": "/usr/share/icons/hicolor/48x48/apps/firefox.png",
      "comment": "Browse the World Wide Web",
      "source": "system",
      "desktopPath": "/usr/share/applications/firefox.desktop"
    }
  ]
}
```

- `id` = desktop 文件名，作为唯一标识
- `defaultAppIds` = 按名称字母排序取前 5 个，用于首次显示默认列表
- 搜索匹配 `name` + `comment` 字段

### 缓存推送

主进程 `win.webContents.send('launcher:apps-updated', apps)` 推送整个 apps 数组，渲染进程 ipcRenderer.on 监听后直接替换 Pinia store。

### 首次/空缓存处理

无数据时列表区隐藏（`v-if`），有数据后才展示。首次启动时扫描异步执行（1~3 秒），完成后自动填充。

### 已删除应用的优雅降级

`launchApp` 时检查 `.desktop` 文件是否存在；不存在则返回 `{ success: false, reason: 'app-removed' }`，前端从列表中移除。

### Pinia Store：`src/stores/launcherStore.js`

命名为 `useLauncherStore` / `launcher`。

## 验收标准

- [ ] Launcher 打开后输入框立刻可用，不卡顿
- [ ] 默认 Top 5 应用列表在打开 Launcher 时立刻展示（非首次启动）
- [ ] 搜索输入后结果立刻出现（本地缓存搜索，不走 IPC）
- [ ] 安装新应用后，1~3 秒内 Launcher 中 silent 出现
- [ ] 卸载应用后，Launcher 中 silent 消失
- [ ] 首次启动（空缓存）时，列表区隐藏，扫描完成后正常展示
- [ ] 选中已删除应用时，Launcher 无报错，无僵尸启动

## 实施计划

- [ ] 1. 创建 `modules/services/launcherAppCacheService.js`：异步全量扫描 + 图标索引 + electron-store 写入
- [ ] 2. 新增 `storageManager.getLauncherAppsStore()` 工厂函数
- [ ] 3. 重构 `systemAppReader.js`：移除同步遍历方法，保留纯解析函数
- [ ] 4. 实现 `fs.watch` 监听 + 防抖 + 增量扫描
- [ ] 5. 在 `main.js` 初始化中注册 `LauncherAppCacheService`（启动异步扫描 + 注册 fs.watch + 启动定时扫描）
- [ ] 6. 修改 `launcherManager.js`：`getCachedApps()` 从缓存服务读取，不再调用同步解析
- [ ] 7. 创建 `src/stores/launcherStore.js`（Pinia）
- [ ] 8. 实现主进程推送 `launcher:apps-updated` + preload 暴露监听 API
- [ ] 9. 改造 `Launcher.vue`：onMounted 直接从 store 读取、条件渲染列表区、已删除应用降级处理
- [ ] 10. `launchApp` IPC handler 中增加 `.desktop` 文件存在性检查
