# refactor-module-structure

## 概述

将 `modules/` 目录按**运行环境归属**重构为三层结构：`canbox/`（Canbox 主程序专用）、`app/`（APP 运行时专用）、`utils/`（两方共用）。同时将混入 `modules/main/api.js` 的 canboxDb handlers 回归 `ipcHandlers.js`，并将 `modules/app.api.js` 重命名为 `app/app.preload.js` 以自解文件名。

当前 `modules/` 下 Canbox 主程序代码与 APP 运行时代码平铺混杂，模块边界模糊，增加理解和维护成本。

## 当前问题

### 1. 模块边界模糊

`modules/core/` 目录同时放置 Canbox 专用的 `canboxDb.js`、`fileTaskDb.js` 和 APP 专用的 `win.js`、`electronStore.js`、`db.js`、`dialog.js`、`sudo.js`，无法一眼区分归属。

### 2. api.js 职责混杂

`modules/main/api.js` 中既包含 APP 运行时 IPC handlers（`msg-db`、`msg-createWindow`、`msg-notification` 等），又包含 Canbox 主程序的 `initCanboxDbIpcHandlers()`（`canboxDb-*` 系列 handler），违背单一职责原则。

### 3. 文件名不自解释

`modules/app.api.js` 的文件名未能直观表达其角色——这是 APP 的 preload 脚本入口，注册 `session.registerPreloadScript` 后被注入到 APP 窗口。

## 核心设计

### 决策 1：三层目录命名

**方案 A**：`modules/canbox/`、`modules/app/`、`modules/utils/`

**方案 B**：`modules/main/`、`modules/runtime/`、`modules/shared/`

**选择方案 A**。

- `canbox` / `app` 直接对应项目架构中「Canbox 主程序」和「APP 运行时」两个运行环境，命名简洁且无歧义
- `utils` 保留原名称，放置 logger 和 DateFormat 两个共用模块
- 方案 B 的 `main` 容易与 Electron 的 `main process` 产生混淆

### 决策 2：`modules/app.api.js` 重命名为 `app/app.preload.js`

`modules/app.api.js` → `modules/app/app.preload.js`

- 文件职责：作为 APP 窗口的 preload 脚本，通过 `session.registerPreloadScript({ filePath: ... })` 注入到每个 APP 窗口
- 文件名 `app.preload.js` 直接表明它属于 APP 的 preload，比单纯的 `preload.js` 更有辨识度（避免与根目录 `preload.js` 混淆）
- 同步更新两处 `registerPreloadScript` 调用：
  - `childprocessEntry.js` L276: `path.join(__dirname, 'modules/app.api.js')` → `path.join(__dirname, 'modules/app/app.preload.js')`
  - `modules/integrated/appWindowManager.js` L65: `path.join(__dirname, '../app.api.js')` → `path.join(__dirname, '../app/app.preload.js')`

### 决策 3：canboxDb handlers 移入 `ipcHandlers.js`

`modules/main/api.js` 中的 `initCanboxDbIpcHandlers()` 函数及全部 `canboxDb-*` handlers → 移入 `ipcHandlers.js`

- `ipcHandlers.js` 本就是 Canbox 主程序所有 IPC handler 的统一注册入口（见 workspace rules）
- 在 `ipcHandlers.js` 中新增分组 `// ========== Canbox 操作历史数据库相关 IPC 处理 ==========`
- `modules/main/api.js` 中删除 `initCanboxDbIpcHandlers` 导出，仅保留 APP runtime handlers

### 决策 4：`api.js` 拆分后归属

- `modules/main/api.js` 拆分后：
  - APP 运行时 handlers → `modules/app/api.js`（新建）
  - canboxDb handlers → 移入 `ipcHandlers.js`
- 原 `modules/main/api.js` 删除
- 更新引用：
  - `ipcHandlers.js` L9: `require('./modules/main/api')` → `require('./modules/app/api')`
  - `childprocessEntry.js` L89: `require('@modules/main/api')` → `require('@modules/app/api')`

### 决策 5：`win.js` 不拆分，整体移入 `modules/app/core/win.js`

经分析，`modules/core/win.js` 的导出 API 中：

| API | 调用链 |
|-----|--------|
| `createWindow()` | `modules/main/api.js`（APP IPC handler `msg-createWindow`）→ **仅 APP** |
| `showNotification()` | `modules/main/api.js`（APP IPC handler `msg-notification`）→ **仅 APP** |
| `setupExternalUrlHandler()` | 无外部直接引用，仅在 `win.js` 内部被 `createWindow` 调用 |
| `showDialog()` | **无任何外部调用**，且使用未定义变量，是死代码 |

`childprocessEntry.js` 有自己的独立副本（内联 `setupExternalUrlHandler` + `createChildWebAppWindow`），不通过 `win.js` 引用。

**结论**：`win.js` 100% 为 APP 专用，整体移入 `modules/app/core/win.js`，不拆分。

### 决策 6：子目录全量移动

以下 Canbox 专用于目录，整体从 `modules/` 下移到 `modules/canbox/` 下，内部文件结构不变：

`childprocess/`、`execution/`、`file-task/`、`integrated/`、`ipc/`、`main/`（除 `api.js`）、`services/`、`update-center/`、`web-app/`

### 决策 7：`modules/core/` 按文件拆分

| 原路径 | 归属 | 新路径 |
|--------|------|--------|
| `modules/core/canboxDb.js` | Canbox 专用 | `modules/canbox/core/canboxDb.js` |
| `modules/core/fileTaskDb.js` | Canbox 专用 | `modules/canbox/core/fileTaskDb.js` |
| `modules/core/win.js` | APP 专用 | `modules/app/core/win.js` |
| `modules/core/electronStore.js` | APP 专用 | `modules/app/core/electronStore.js` |
| `modules/core/db.js` | APP 专用 | `modules/app/core/db.js` |
| `modules/core/dialog.js` | APP 专用 | `modules/app/core/dialog.js` |
| `modules/core/sudo.js` | APP 专用 | `modules/app/core/sudo.js` |

**原 `modules/core/` 目录删除**。

### 决策 8：`modules/utils/` 按文件拆分

| 原路径 | 归属 | 新路径 |
|--------|------|--------|
| `modules/utils/logger.js` | **共用** | `modules/utils/logger.js` |
| `modules/utils/DateFormat.js` | **共用** | `modules/utils/DateFormat.js` |
| `modules/utils/fs-utils.js` | Canbox 专用 | `modules/canbox/utils/fs-utils.js` |
| `modules/utils/ObjectUtils.js` | Canbox 专用 | `modules/canbox/utils/ObjectUtils.js` |
| `modules/utils/repoUtils.js` | Canbox 专用 | `modules/canbox/utils/repoUtils.js` |

### 决策 9：`modules/build-asar.js` 移入 `modules/canbox/`

`modules/build-asar.js` → `modules/canbox/build-asar.js`

### 决策 10：路径别名不变，更新所有引用

`@modules` 别名保持在 `jsconfig.json` 和 `main.js`/`childprocessEntry.js` 的 `module-alias` 中指向 `./modules/`，只需更新所有 `require` 字符串中的子路径前缀。例如：

- `require('@modules/main/storageManager')` → `require('@modules/canbox/main/storageManager')`
- `require('@modules/core/win')` → `require('@modules/app/core/win')`

### 目录结构对比

**变更前：**
```
modules/
├── app.api.js                  # 文件名不自解释
├── build-asar.js               # 与 core/ 平铺
├── core/                       # Canbox + APP 混杂
│   ├── canboxDb.js             # → Canbox
│   ├── fileTaskDb.js           # → Canbox
│   ├── win.js                  # → APP
│   ├── electronStore.js        # → APP
│   ├── db.js                   # → APP
│   ├── dialog.js               # → APP
│   └── sudo.js                 # → APP
├── childprocess/               # Canbox
├── execution/                  # Canbox
├── file-task/                  # Canbox
├── integrated/                 # Canbox
├── ipc/                        # Canbox
├── main/                       # Canbox（但 api.js 含 canboxDb handlers）
├── services/                   # Canbox
├── update-center/             # Canbox
├── utils/                      # Canbox + 共用混杂
├── web-app/                    # Canbox
```

**变更后：**
```
modules/
├── canbox/                     # Canbox 主程序专用
│   ├── build-asar.js
│   ├── core/
│   │   ├── canboxDb.js
│   │   └── fileTaskDb.js
│   ├── childprocess/
│   ├── execution/
│   ├── file-task/
│   ├── integrated/
│   ├── ipc/
│   ├── main/                   # 移除 api.js 的 canboxDb handlers
│   ├── services/
│   ├── update-center/
│   ├── utils/
│   │   ├── fs-utils.js
│   │   ├── ObjectUtils.js
│   │   └── repoUtils.js
│   └── web-app/
├── app/                        # APP 运行时专用
│   ├── api.js                  # APP IPC handlers（从 modules/main/api.js 拆分）
│   ├── app.preload.js          # APP preload 脚本（从 modules/app.api.js 重命名）
│   └── core/
│       ├── win.js
│       ├── electronStore.js
│       ├── db.js
│       ├── dialog.js
│       └── sudo.js
└── utils/                      # 两方共用
    ├── logger.js
    └── DateFormat.js
```

## 验收标准

- [ ] 1. `npm run start` 正常启动，Canbox 主窗口显示正常
- [ ] 2. 安装并启动一个 WebApp（如文心一言），网页加载正常、后退/前进/刷新导航正常
- [ ] 3. 安装并启动一个普通 APP（如 Clipboard），功能正常，electronStore 读写正常
- [ ] 4. Canbox 操作历史记录（canboxDb）正常读写（安装/卸载/导入 APP 时产生历史记录）
- [ ] 5. 子进程模式（childprocessEntry.js）正常启动 APP
- [ ] 6. 零新增 linter 错误（原已有错误不计）
- [ ] 7. 原 `modules/core/` 目录已删除，原 `modules/app.api.js` 已删除，原 `modules/main/api.js` 已删除

## 实施参考

### 涉及文件

#### 新建文件（文件移动 + api.js 拆分）

| 新路径 | 来源 | 说明 |
|--------|------|------|
| `modules/canbox/core/canboxDb.js` | `modules/core/canboxDb.js` | 移动 |
| `modules/canbox/core/fileTaskDb.js` | `modules/core/fileTaskDb.js` | 移动 |
| `modules/app/core/win.js` | `modules/core/win.js` | 移动 |
| `modules/app/core/electronStore.js` | `modules/core/electronStore.js` | 移动 |
| `modules/app/core/db.js` | `modules/core/db.js` | 移动 |
| `modules/app/core/dialog.js` | `modules/core/dialog.js` | 移动 |
| `modules/app/core/sudo.js` | `modules/core/sudo.js` | 移动 |
| `modules/app/app.preload.js` | `modules/app.api.js`（重命名） | 重命名 + 移入 app/ |
| `modules/app/api.js` | `modules/main/api.js`（拆分） | 仅保留 APP handlers |
| `modules/canbox/build-asar.js` | `modules/build-asar.js` | 移动 |
| `modules/canbox/utils/fs-utils.js` | `modules/utils/fs-utils.js` | 移动 |
| `modules/canbox/utils/ObjectUtils.js` | `modules/utils/ObjectUtils.js` | 移动 |
| `modules/canbox/utils/repoUtils.js` | `modules/utils/repoUtils.js` | 移动 |
| `modules/canbox/childprocess/*` | `modules/childprocess/*` | 全目录移动 |
| `modules/canbox/execution/*` | `modules/execution/*` | 全目录移动 |
| `modules/canbox/file-task/*` | `modules/file-task/*` | 全目录移动 |
| `modules/canbox/integrated/*` | `modules/integrated/*` | 全目录移动 |
| `modules/canbox/ipc/*` | `modules/ipc/*` | 全目录移动 |
| `modules/canbox/main/*` | `modules/main/*`（除 api.js） | 全目录移动 |
| `modules/canbox/services/*` | `modules/services/*` | 全目录移动 |
| `modules/canbox/update-center/*` | `modules/update-center/*` | 全目录移动 |
| `modules/canbox/web-app/*` | `modules/web-app/*` | 全目录移动 |

#### 修改文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `ipcHandlers.js` | 修改 | 新增 canboxDb handlers 分组；更新 require 路径 |
| `main.js` | 修改 | 更新 `module-alias` 及所有 `@modules/*` 引用路径 |
| `childprocessEntry.js` | 修改 | 更新 `module-alias`、`@modules/*` 引用路径、`registerPreloadScript` filePath |
| `modules/app/api.js`（新） | 新建+修改 | 从 `modules/main/api.js` 拆分，只保留 APP handlers |
| `modules/app/app.preload.js`（新） | 重命名 | 从 `modules/app.api.js` 移入，内部注释更新 |
| `modules/integrated/appWindowManager.js` | 修改 | 更新 `registerPreloadScript` filePath 及所有 `@modules/*` 引用 |
| `modules/web-app/app-zoom.js` | 修改 | 注释中提到 `app.api.js`，更新为 `app.preload.js` |
| `jsconfig.json` | 可选 | 路径别名保持 `@modules/*: ["./modules/*"]` 不变 |

#### 删除文件/目录

| 路径 | 说明 |
|------|------|
| `modules/core/` | 全部文件已移走 |
| `modules/childprocess/` | 已移入 `modules/canbox/` |
| `modules/execution/` | 已移入 `modules/canbox/` |
| `modules/file-task/` | 已移入 `modules/canbox/` |
| `modules/integrated/` | 已移入 `modules/canbox/` |
| `modules/ipc/` | 已移入 `modules/canbox/` |
| `modules/main/` | 已移入 `modules/canbox/`（除 api.js，已拆分删除） |
| `modules/services/` | 已移入 `modules/canbox/` |
| `modules/update-center/` | 已移入 `modules/canbox/` |
| `modules/web-app/` | 已移入 `modules/canbox/` |
| `modules/build-asar.js` | 已移入 `modules/canbox/` |
| `modules/app.api.js` | 已重命名为 `modules/app/app.preload.js` |
| `modules/main/api.js` | 已拆分为 `modules/app/api.js` + handlers 移入 `ipcHandlers.js` |

### 路径替换映射表

以下为各文件中的 `require` / `path.join` 路径替换规则。核心规则：Canbox 专用模块 → 加 `canbox/` 前缀，APP 专用模块 → 加 `app/` 前缀，共用模块 → 保持 `utils/` 前缀。

#### @modules 别名引用（全局替换规则）

| 原路径（require 字符串内） | 新路径 | 涉及文件 |
|---|---|---|
| `@modules/main/...` | `@modules/canbox/main/...` | `main.js`、`ipcHandlers.js`、`childprocessEntry.js`、`tray.js`、`locales/index.js`、`modules/integrated/appWindowManager.js`、`modules/utils/logger.js` 等 |
| `@modules/core/canboxDb` | `@modules/canbox/core/canboxDb` | `ipcHandlers.js`、`modules/ipc/appManagerIpcHandler.js` |
| `@modules/core/fileTaskDb` | `@modules/canbox/core/fileTaskDb` | `modules/file-task/file-task-manager.js` 等 |
| `@modules/core/win` | `@modules/app/core/win` | `modules/integrated/appWindowManager.js` |
| `@modules/core/electronStore` | `@modules/app/core/electronStore` | `modules/main/api.js` 等 |
| `@modules/core/db` | `@modules/app/core/db` | `modules/main/api.js` 等 |
| `@modules/core/dialog` | `@modules/app/core/dialog` | `modules/main/api.js` 等 |
| `@modules/core/sudo` | `@modules/app/core/sudo` | `modules/main/api.js` 等 |
| `@modules/build-asar` | `@modules/canbox/build-asar` | `ipcHandlers.js` |
| `@modules/childprocess/...` | `@modules/canbox/childprocess/...` | 各引用文件 |
| `@modules/execution/...` | `@modules/canbox/execution/...` | 各引用文件 |
| `@modules/file-task/...` | `@modules/canbox/file-task/...` | 各引用文件 |
| `@modules/integrated/...` | `@modules/canbox/integrated/...` | 各引用文件 |
| `@modules/ipc/...` | `@modules/canbox/ipc/...` | 各引用文件 |
| `@modules/services/...` | `@modules/canbox/services/...` | 各引用文件 |
| `@modules/update-center/...` | `@modules/canbox/update-center/...` | 各引用文件 |
| `@modules/web-app/...` | `@modules/canbox/web-app/...` | 各引用文件 |
| `@modules/utils/logger` | `@modules/utils/logger` | **不变** |
| `@modules/utils/DateFormat` | `@modules/utils/DateFormat` | **不变** |
| `@modules/utils/fs-utils` | `@modules/canbox/utils/fs-utils` | 各引用文件 |
| `@modules/utils/ObjectUtils` | `@modules/canbox/utils/ObjectUtils` | 各引用文件 |
| `@modules/utils/repoUtils` | `@modules/canbox/utils/repoUtils` | 各引用文件 |
| `@modules/main/api` | `@modules/app/api` | `childprocessEntry.js` |

#### 相对路径引用

| 原路径 | 新路径 | 所在文件 |
|--------|--------|----------|
| `require('./modules/main/api')` | `require('./modules/app/api')` | `ipcHandlers.js` L9 |
| `require('./modules/ipc/...')` | `require('./modules/canbox/ipc/...')` | `ipcHandlers.js` L6,8 |
| `require('./modules/childprocess/...')` | `require('./modules/canbox/childprocess/...')` | `ipcHandlers.js` L14 |
| `require('./modules/main/...')` | `require('./modules/canbox/main/...')` | `ipcHandlers.js` L12,15,16 |
| `require('./modules/update-center')` | `require('./modules/canbox/update-center')` | `ipcHandlers.js` L18 |
| `path.join(__dirname, 'modules/app.api.js')` | `path.join(__dirname, 'modules/app/app.preload.js')` | `childprocessEntry.js` L276 |
| `path.join(__dirname, '../app.api.js')` | `path.join(__dirname, '../app/app.preload.js')` | `modules/integrated/appWindowManager.js` L65 |

### API 拆分详细内容

#### `modules/app/api.js`（从 `modules/main/api.js` 拆分后保留的 APP handlers）

保留以下 handler 注册：

- `initApiIpcHandlers` 函数骨架（仍为导出入口）
- `msg-db` handler（APP 的 PouchDB 操作）
- `msg-createWindow` handler（APP 窗口创建）
- `msg-notification` handler（APP 通知）
- `msg-dialog` handler（APP 对话框）
- `msg-electronStore` handler（APP 配置存储）
- `msg-sudo` handler（APP 提权执行）
- `msg-openUrl` handler（APP 打开外部 URL）
- `i18n-get-locale` handler（供 APP 获取语言设置）
- `msg-getLogDir` handler（日志目录）

**需要删除**的函数：

- `initCanboxDbIpcHandlers()` 整个函数及其导出行 `module.exports.initCanboxDbIpcHandlers = initCanboxDbIpcHandlers;`

- 所有 `canboxDb-*` handler：
  - `ipcMain.handle('canboxDb-put', ...)`
  - `ipcMain.handle('canboxDb-get', ...)`
  - `ipcMain.handle('canboxDb-getAll', ...)`
  - `ipcMain.handle('canboxDb-find', ...)`
  - `ipcMain.handle('canboxDb-remove', ...)`
  - `ipcMain.handle('canboxDb-createIndex', ...)`
  - `ipcMain.handle('canboxDb-allDocs', ...)`
  - `ipcMain.handle('canboxDb-bulkDocs', ...)`
  - `ipcMain.handle('canboxDb-on-changes', ...)`
  - `ipcMain.handle('canboxDb-export-records', ...)`
  - `ipcMain.handle('canboxDb-import-records', ...)`

#### `ipcHandlers.js` 新增 canboxDb handlers 分组

在 `ipcHandlers.js` 末尾（或合适位置），使用独立分组注释块，将上述所有 `canboxDb-*` handler 以与现有分组一致的风格注册。

### `modules/app/app.preload.js` 名称调整

`modules/app.api.js` → `modules/app/app.preload.js`：
- 文件名重命名 + 移入 `modules/app/` 目录
- 文件内部 `console.log` 注释中的 `app.api.js` 字符串改为 `app.preload.js`
- 功能逻辑**完全不变**

### 关键注意事项

1. **`module-alias` 配置**：`main.js` L19 和 `childprocessEntry.js` L11 中的 `'@modules': path.join(__dirname, './modules')` **保持不变**，只改 require 字符串
2. **electron-builder `files` 配置**：`package.json` 中的 `"modules/**/*"` glob 已覆盖新路径，无需修改
3. **`canboxDb` 调用注意事项**：`canboxDb.put()` 等方法需要传入 callback 参数（项目规约第 7 条），移动文件中如有遗漏需一并修复
4. **`modules/web-app/app-zoom.js` L3 注释**：`通过 app.api.js preload...` → `通过 app.preload.js preload...`
5. **`modules/app.app.preload.js` 内部注释**：`app.api.js==` → `app.preload.js==`
6. **`childprocessEntry.js` 中的内联代码**：`setupExternalUrlHandler` 和 `createChildWebAppWindow` 是独立副本，不与 `win.js` 合并

## 实施计划

- [ ] 1. 创建新目录结构：`modules/canbox/core/`、`modules/canbox/utils/`、`modules/app/core/`、`modules/app/`
- [ ] 2. 移动 `modules/core/` 下的 7 个文件到各自归属的 `canbox/core/` 和 `app/core/`
- [ ] 3. 移动 `modules/` 下 8 个 Canbox 子目录（childprocess/、execution/、file-task/、integrated/、ipc/、main/、services/、update-center/、web-app/）到 `modules/canbox/` 下
- [ ] 4. 移动 `modules/build-asar.js` → `modules/canbox/build-asar.js`
- [ ] 5. 移动 `modules/utils/fs-utils.js`、`ObjectUtils.js`、`repoUtils.js` → `modules/canbox/utils/`；`logger.js`、`DateFormat.js` 保留在 `modules/utils/`
- [ ] 6. 重命名 `modules/app.api.js` → `modules/app/app.preload.js`，更新内部注释中的 `app.api.js` → `app.preload.js`
- [ ] 7. 创建 `modules/app/api.js`：从 `modules/main/api.js` 复制，删除 `initCanboxDbIpcHandlers` 函数和所有 `canboxDb-*` handler，删除导出行
- [ ] 8. 更新 `ipcHandlers.js`：新增 canboxDb handlers 分组，复制 `initCanboxDbIpcHandlers` 中的 handler 注册代码；更新所有 require 路径
- [ ] 9. 更新 `childprocessEntry.js`：更新 module-alias 和所有 require 路径；更新 `registerPreloadScript` filePath
- [ ] 10. 更新 `main.js`：更新所有 `@modules/*` require 路径
- [ ] 11. 更新 `modules/canbox/` 和 `modules/app/` 下所有文件内部的 `@modules/*` require 路径
- [ ] 12. 更新 `tray.js` 的 `@modules/*` require 路径
- [ ] 13. 更新 `locales/index.js` 的 `@modules/*` require 路径
- [ ] 14. 更新 `modules/web-app/app-zoom.js` L3 注释
- [ ] 15. 删除原目录：`modules/core/`、`modules/childprocess/`、`modules/execution/`、`modules/file-task/`、`modules/integrated/`、`modules/ipc/`、`modules/main/`、`modules/services/`、`modules/update-center/`、`modules/web-app/`、`modules/build-asar.js`、`modules/app.api.js`、`modules/main/api.js`
- [ ] 16. 运行 `npm run start` 验证 Canbox 主程序启动正常
- [ ] 17. 验证 APP（普通 APP + WebApp）启动正常、功能正常
- [ ] 18. 运行 `npm run build` 验证构建通过
