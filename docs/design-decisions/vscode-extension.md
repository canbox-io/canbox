# Canbox VSCode/VSCodium 扩展：可行性分析与能力规划

> **状态：** 调研阶段  
> **日期：** 2026-06-03  
> **作者：** Canbox Team  

## 1. 背景与定位

### 1.1 动机

Canbox APP 开发目前依赖手动操作：手写 `app.json` 等配置文件、手动配置 TypeScript 类型、手动执行 asar 打包和发布流程。如果提供一个 VSCode/VSCodium 扩展，可以显著改善开发体验。

### 1.2 核心定位

**VSCode 扩展 ≠ Canbox 运行时替代品。** 它的定位是**开发辅助工具**。APP 的调试和运行仍然需要安装 Canbox 主程序，扩展专注于编码阶段的效率提升。

### 1.3 当前 APP 开发工作流

```
1. 初始化项目 → 手写 app.json、uat.dev.json、cb.build.json、preload.js
2. 编码        → 写 Vue/JS 代码，手动配置 tsconfig.json + canbox.d.ts
3. 调试        → 在 Canbox 主程序中「开发 APP」添加项目路径，启动调试
4. 打包        → 手动执行 asar 打包命令
5. 发布        → 手动编写 repos 元数据，推送到仓库
```

扩展的核心价值：**让第 1、2、4、5 步在 VSCode 内完成，第 3 步提供辅助**。

---

## 2. Canbox APP 现有开发 API 回顾

运行在 `.asar` 包内的 APP 通过 `window.canbox` 访问以下 API：

```
window.canbox
├── db          // PouchDB 本地数据库（增删改查、索引、Mango 查询）
├── canboxDb    // 操作历史数据库
├── store       // electron-store 本地配置存储
├── win         // 创建子窗口、系统通知
├── dialog      // 文件选择/保存/消息对话框
├── sudo        // 提权执行命令
├── getLocale() // 获取当前语言
└── openUrl()   // 用浏览器打开外部链接
```

Canbox 主程序通过 `window.api` 暴露管理 API（应用管理、仓库管理、文件任务、WebApp 创建等）。

---

## 3. 能力矩阵

### 第一梯队：纯静态辅助（无需 Canbox 主程序，性价比最高）

| 能力 | 说明 | 难度 | 价值 |
|------|------|------|------|
| **A. app.json / uat.dev.json / cb.build.json Schema 校验** | JSON Schema 验证 + 字段自动补全 + 悬浮文档 + categories 枚举提示 | ⭐ 低 | ⭐⭐⭐⭐⭐ |
| **B. Canbox API 代码片段** | 快速插入 `canbox.db.put()`、`canbox.store.get()`、`canbox.win.*` 等 API 调用模板 | ⭐ 低 | ⭐⭐⭐⭐ |
| **C. canbox.d.ts 一键下载 + tsconfig.json 自动配置** | 命令面板执行「下载类型定义」，自动创建 `types/canbox.d.ts` 并修改 `tsconfig.json` | ⭐ 低 | ⭐⭐⭐⭐ |
| **D. Canbox APP 项目脚手架** | 命令面板「Create New App」→ 填写 App Name、App ID、Description 等 → 自动生成完整项目结构 | ⭐⭐ 中 | ⭐⭐⭐⭐⭐ |

**A 详细说明：** 在 VSCode `settings.json` 中关联 schema，编辑 `app.json` / `uat.dev.json` / `cb.build.json` 时实时报错、自动补全、hover 显示字段文档。

**B 详细说明：**

| 触发前缀 | 展开内容 |
|---------|---------|
| `cb-db-put` | `canbox.db.put({ _id: '', ... })` 完整模板 |
| `cb-store-get` | `canbox.store.get('config', 'key')` |
| `cb-win-create` | `canbox.win.createWindow(...)` |
| `cb-sudo` | `canbox.sudo.exec(...)` |
| `cb-notification` | `canbox.win.notification(...)` |

**D 详细说明：** 弹出表单收集以下信息后自动生成目录结构：

```
App Name:          my-app
App ID:            com.github.username.my-app
Description:       ...
Author:            ...
Type:              [本地 APP | WebApp]
Categories:        [utility, development, ...] (多选)
Include Vue:       [Yes / No]
Include preload.js:[Yes / No]
```

自动生成：`app.json` + `uat.dev.json` + `cb.build.json` + `README.md` + 模板源码文件。

### 第二梯队：需 Canbox 主程序安装（无需运行时调试）

| 能力 | 说明 | 难度 | 依赖 |
|------|------|------|------|
| **E. 与 Canbox 主程序通信** | 侧边栏查看已注册的开发 APP 列表，一键注册/重新加载/取消注册 | ⭐⭐⭐ 高 | Canbox 需新增 CLI 或 HTTP API |
| **F. .asar 打包/解包右键菜单** | 右键文件夹 →「Canbox: Pack asar」，右键 .asar →「Canbox: Extract asar」 | ⭐⭐ 中 | 扩展内捆绑 `asar` npm 包 |

**E 详细说明：** 需要 Canbox 主程序提供 CLI 接口：

```bash
canbox-cli --add-dev-app /path/to/app    # 注册开发 APP
canbox-cli --list-dev-apps               # 列出所有开发 APP
canbox-cli --reload-dev-app <uid>        # 重新加载
canbox-cli --remove-dev-app <uid>        # 取消注册
```

或通过 WebSocket（`ws://localhost:12333`）与 Canbox 主程序通信，还能实现「保存代码后自动重新加载 APP」的热重载体验。

### 第三梯队：高级功能（投入大，体验提升显著）

| 能力 | 说明 | 难度 |
|------|------|------|
| **G. 侧边栏开发 APP 管理面板** | TreeView 展示所有开发 APP 的状态、ID、路径，支持快捷操作 | ⭐⭐⭐ 高 |
| **H. 发布助手（Repos 元数据生成）** | 引导填写 repos 信息，自动生成符合 Canbox 仓库格式的 JSON | ⭐⭐⭐ 高 |
| **I. window.canbox Mock 环境** | 为单元测试提供 mock 的 `window.canbox` 对象 | ⭐⭐⭐⭐ 很高 |

---

## 4. 能力矩阵总览

```
┌──────────────────────┬──────────┬──────────┬───────────────────────┐
│   能力               │ 依赖Canbox│ 开发难度 │ 价值                  │
├──────────────────────┼──────────┼──────────┼───────────────────────┤
│ A. Schema 校验       │ ❌        │ ⭐ 低     │ ⭐⭐⭐⭐⭐ 很高         │
│ B. API 代码片段      │ ❌        │ ⭐ 低     │ ⭐⭐⭐⭐  高           │
│ C. 类型定义下载      │ ❌        │ ⭐ 低     │ ⭐⭐⭐⭐  高           │
│ D. 项目脚手架        │ ❌        │ ⭐⭐ 中   │ ⭐⭐⭐⭐⭐ 很高         │
│ E. 主程序通信        │ ✅ CLI    │ ⭐⭐⭐ 高  │ ⭐⭐⭐⭐  高           │
│ F. asar 打包/解包    │ ❌        │ ⭐⭐ 中   │ ⭐⭐⭐   中           │
│ G. 开发 APP 管理面板  │ ✅ CLI    │ ⭐⭐⭐ 高  │ ⭐⭐⭐⭐  高           │
│ H. 发布助手          │ ✅ Git    │ ⭐⭐⭐ 高  │ ⭐⭐⭐   中           │
│ I. Mock 环境         │ ❌        │ ⭐⭐⭐⭐ 很高│ ⭐⭐⭐   中           │
└──────────────────────┴──────────┴──────────┴───────────────────────┘
```

---

## 5. 分阶段实施计划

### Phase 1：基础开发体验（2-3 天，纯前端工作）

**目标：** 不依赖 Canbox 主程序任何改动，立即可做。

- [ ] **A** — `app.json` / `uat.dev.json` / `cb.build.json` 的 JSON Schema 校验与智能提示
- [ ] **B** — Canbox API 代码片段（Snippets）
- [ ] **C** — 一键下载 `canbox.d.ts` + 自动配置 `tsconfig.json`
- [ ] **D** — APP 项目脚手架（Create New App 向导）

### Phase 2：工具链增强（需 Canbox 主程序配合）

**目标：** 打通 VSCode 与 Canbox 主程序的通信链路。

- [ ] **F** — `.asar` 打包/解包右键菜单
- [ ] **E** — 侧边栏开发 APP 管理面板（依赖 Canbox 新增 CLI 接口）

**Canbox 主程序需配合的改动：**
- 新增 CLI 命令或 HTTP/WebSocket API 用于开发 APP 管理
- 可选：提供热重载通知机制

### Phase 3：全流程覆盖（可选）

- [ ] **H** — 发布助手（Repos 元数据生成与推送）
- [ ] **I** — `window.canbox` Mock 环境

---

## 6. 技术要点

### 6.1 扩展的技术栈

VSCode 扩展使用标准的 Node.js + TypeScript 开发，通过 VSCode Extension API 访问编辑器功能：

- `vscode.languages.registerCompletionItemProvider` — 代码补全
- `vscode.languages.json` contribution point — JSON Schema 关联
- `vscode.workspace.fs` — 文件系统操作
- `vscode.window.createTreeView` — 侧边栏面板

### 6.2 asar 打包集成

扩展可以捆绑 `asar` npm 包实现打包/解包，无需依赖 Canbox 主程序。需注意：

- 读取 `.asar` 内文件应使用 `asar.extractFile()` 而非 `fs.readFileSync()`（避免 Windows 文件锁定）
- 操作 asar 文件本身（删除、移动）应使用 `original-fs`

### 6.3 与 Canbox 主程序的通信

两种可选方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **CLI 命令** | 实现简单，解耦 | 无法实时推送状态变化 |
| **WebSocket** | 双向通信，可实现热重载 | Canbox 需常驻 WS 服务 |

建议 Phase 2 先用 CLI 方案，后续评估是否需要 WebSocket。

### 6.4 JSON Schema 文件组织

扩展应打包以下 Schema 文件供 VSCode 使用：

```
extension/
├── schemas/
│   ├── app.json.schema.json       # app.json 的 Schema
│   ├── uat.dev.json.schema.json   # uat.dev.json 的 Schema
│   └── cb.build.json.schema.json  # cb.build.json 的 Schema
├── snippets/
│   └── canbox-api.code-snippets   # 代码片段
└── templates/
    └── canbox-app/                # 项目脚手架模板
```

---

## 7. 后续行动

1. [ ] **Phase 1 启动** — 创建 `canbox-vscode-extension` 项目仓库
2. [ ] **项目组织** — 确定 canbox / canbox-pages / 扩展项目的目录组织方案
3. [ ] **Canbox 主程序评估** — 评估 CLI 接口方案，为 Phase 2 做准备

---

*最后更新：2026-06-03*
