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

## 实施参考

> 以下信息对 AI 实施时至关重要，确保文档自包含。

### 现有文件映射（需要修改的文件）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `modules/services/launcherAppCacheService.js` | **新建** | 后台缓存服务核心 |
| `src/stores/launcherStore.js` | **新建** | Pinia store |
| `modules/main/storageManager.js` | 修改 | 新增 `getLauncherAppsStore()` |
| `modules/launcher/systemAppReader.js` | 修改 | 移除 `getSystemApplications()`、`resolveIconPath()` |
| `modules/launcher/launcherManager.js` | 修改 | 缓存服务替换同步加载 |
| `modules/launcher/appSearchEngine.js` | 可能修改 | 前端本地搜索替代 IPC 搜索 |
| `src/components/Launcher.vue` | 修改 | 条件渲染、本地搜索、降级处理 |
| `ipcHandlers.js` | 修改 | 新增/调整 launcher IPC |
| `preload.js` | 修改 | 新增 `launcher:apps-updated` 监听 |
| `main.js` | 修改 | init 中注册 LauncherAppCacheService |

### 关键代码模式参考

**1. `electron-store` 工厂函数模式**（参照 `storageManager.js` 现有 `getReposStore()`）：

```javascript
// modules/main/storageManager.js 中新增
function getLauncherAppsStore() {
    return new Storage({
        name: 'launcher-apps',
        cwd: 'Users'  // 文件路径：{UsersPath}/launcher-apps.json
    });
}
```

**2. 后台定时服务模式**（参照 `repoMonitorService.js`）：

- 使用 `node-cron` 包（已在 `package.json` 中，版本 `^3.0.0`）
- 单例模式：`class LauncherAppCacheService { static getInstance() { ... } }`
- 构造函数创建 `CronJob` 实例
- `start()` / `stop()` 生命周期

**3. Pinia store 模式**（参照 `src/stores/fileTaskStore.js`）：

```javascript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLauncherStore = defineStore('launcher', () => {
    const apps = ref([]);
    const defaultAppIds = ref([]);
    const isLoading = ref(false);
    // ...
    return { apps, defaultAppIds, isLoading, loadFromCache, search };
});
```

**4. IPC 注册模式**（参照 `ipcHandlers.js` 现有 `launcher:*` handler）：

- launcher 相关 IPC 在 `// ========== launcher 相关 IPC 处理 ==========` 分组下
- 新增 `launcher:get-launcher-store` 或直接在现有 `launcher:getAllApps` 中改为读缓存
- 推送事件使用 `mainWindow.webContents.send('launcher:apps-updated', apps)`

**5. preload.js API 暴露模式**（参照现有 `api.launcher` 命名空间）：

```javascript
// preload.js 中新增
launcher: {
    // ... 现有方法
    onAppsUpdated: (callback) => {
        ipcRenderer.on('launcher:apps-updated', (event, apps) => callback(apps));
    }
}
```

### 关键路径常量

**`.desktop` 文件搜索目录**（Flatpak 路径需要解析 `$HOME`）：

| 目录 | 用途 |
|------|------|
| `/usr/share/applications/` | 系统应用 |
| `~/.local/share/applications/` | 用户应用 |
| `~/.local/share/flatpak/exports/share/applications/` | Flatpak 用户导出 |
| `/var/lib/flatpak/exports/share/applications/` | Flatpak 系统导出（可能不存在） |

**图标主题搜索目录**（建索引时的遍历范围，深度限制 5 层）：

| 目录 |
|------|
| `/usr/share/icons/` |
| `~/.local/share/icons/` |
| `/usr/share/pixmaps/` |

### `launcher-apps.json` 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | number | 缓存格式版本（当前 = 1），用于迁移 |
| `lastScanTime` | number | 最后扫描时间戳 |
| `defaultAppIds` | string[] | Top 5 应用 id 列表，`scanAll()` 完成后按 name 字母序取前 5 个 |
| `apps` | object[] | 全量应用列表 |
| `apps[].id` | string | desktop 文件名，如 `firefox.desktop` |
| `apps[].name` | string | Name 字段 |
| `apps[].exec` | string | Exec 字段原始值 |
| `apps[].icon` | string | Icon 字段原始值 |
| `apps[].iconPath` | string \| null | 已解析的图标完整路径 |
| `apps[].comment` | string | Comment 字段 |
| `apps[].source` | string | `"system"` \| `"flatpak"` |
| `apps[].desktopPath` | string | .desktop 文件完整路径 |

### 搜索逻辑迁移

当前 `appSearchEngine.js` 在主进程执行搜索。优化后搜索在渲染端 Pinia store 中本地执行（数据已在内存）。

算法保持子序列匹配 + 拼音匹配（使用 `pinyin-pro` 包）。`pinyin-pro` 已在 `package.json` 中（`^1.5.5`），但注意它是 npm 包，renderer 进程通过 Vite 打包可用。

搜索匹配范围：`name` + `comment`。

### 图标路径索引构建细节

```javascript
// scanAll() 中的图标索引构建伪代码
async function buildIconIndex() {
    const map = new Map();
    const iconDirs = [
        '/usr/share/icons',
        path.join(os.homedir(), '.local/share/icons'),
        '/usr/share/pixmaps'
    ];
    for (const dir of iconDirs) {
        if (!fs.existsSync(dir)) continue;
        await walkDir(dir, 5, (filePath) => {
            const name = path.basename(filePath, path.extname(filePath));
            if (!map.has(name)) map.set(name, filePath);  // 先到先得
        });
    }
    return map;
}
```

### node-cron 定时扫描配置

```javascript
// 每小时一次，参照 repoMonitorService.js 模式
const scanJob = new CronJob('0 * * * *', () => {
    this.scanAll();
});
```

### 防抖实现

```javascript
let debounceTimer = null;

function onFsWatchChange(eventType, filename) {
    if (!filename.endsWith('.desktop')) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        this.incrementalScan();
    }, 1000);
}
```

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
