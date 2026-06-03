# Canbox 多项目管理方案分析

> **状态：** 调研阶段
> **日期：** 2026-06-03
> **作者：** Canbox Team

## 1. 背景

随着 Canbox 项目的发展，需要管理多个相关但独立的项目：

| 项目 | 说明 |
|------|------|
| **canbox** | Canbox 主程序（Electron 桌面应用） |
| **canbox-pages** | Canbox 官网/文档站（计划） |
| **canbox-vscode-extension** | VSCode/VSCodium 扩展（计划） |

当前每个项目有独立的 git 仓库。随着项目数量增加，需要一套合理的多项目管理办法。

---

## 2. 方案对比

### 方案1：Monorepo（合并 Git 仓库）

将三个项目合并到一个 git 仓库中。

**目录结构：**
```
canbox/
├── packages/
│   ├── canbox/                # 主程序
│   ├── canbox-pages/          # 官网
│   └── canbox-vscode-ext/     # VSCode 扩展
├── package.json               # 根 workspace 配置
└── ...
```

**优点：**
- 统一版本管理，原子提交跨项目变更
- 共享构建脚本和 CI/CD 配置
- 依赖管理方便（npm/pnpm workspaces）

**缺点：**
- **需要重建 git 历史**（这是用户的主要顾虑）
- 仓库体积变大
- 权限管理不够灵活（所有项目一套权限）

**结论：** 由于需要重建 git，当前阶段不优先考虑。

---

### 方案2：VSCode Multi-Root Workspace

保持三个独立 git 仓库，使用 VSCode 的 `.code-workspace` 文件统一管理。

#### 2.1 什么是 Multi-Root Workspace？

VSCode 的原生功能，允许在**一个 VSCode 窗口中同时打开多个项目文件夹**。

#### 2.2 配置方式

创建 `canbox.code-workspace` 文件：

```json
{
  "folders": [
    { "name": "canbox",       "path": "./canbox" },
    { "name": "canbox-pages",  "path": "./canbox-pages" },
    { "name": "vscode-ext",    "path": "./canbox-vscode-extension" }
  ],
  "settings": {
    "files.exclude": { "**/.git": true },
    "search.exclude": { "**/node_modules": true }
  }
}
```

双击该文件，VSCode 会在一个窗口里打开三个项目。

#### 2.3 优点

| 优点 | 说明 |
|------|------|
| 统一开发体验 | 一个窗口管理三个项目 |
| 跨项目搜索 | Ctrl+Shift+F 搜索所有项目 |
| 共享配置 | workspace 级别的 settings、extensions 推荐 |
| **Git 独立** | 每个项目保持独立 repo，不需要重建 |
| 调试配置 | 可配置跨项目的 Debug 组合 |

#### 2.4 缺点

| 缺点 | 说明 |
|------|------|
| **AI 工具支持参差** | 多项目上下文下，AI 助手可能只识别当前激活的文件夹 |
| 终端管理复杂 | 需手动切换终端到对应项目目录 |
| 部分插件不友好 | 有些插件只认第一个或当前激活的文件夹 |

#### 2.5 AI 工具对 Multi-Root Workspace 的支持

| 工具 | 支持情况 |
|------|---------|
| **CodeBuddy** | 有限支持。能读取打开的文件，但"工作区根目录"概念在多根下模糊。建议操作时有明确项目路径 |
| **Trae** | 类似，建议实际测试确认 |
| **GitHub Copilot** | 较差，通常只认当前激活的文件夹作为上下文 |
| **Cline** | 较差，file reading 基于单个 workspace folder |

**缓解方案：** 需要时单独打开某个项目文件夹，让 AI 工具获得清晰上下文。

---

### 方案3：路标文件（Project Roadmap）

保持三个独立 repo，在主项目中用配置文件声明子项目的位置和关系。

#### 3.1 实现方式

**方式 A：纯声明式路标文件**

```json
// canbox/roadmap.json
{
  "projects": [
    { "name": "canbox",    "path": ".",           "repo": "..." },
    { "name": "pages",     "path": "../canbox-pages", "repo": "..." },
    { "name": "vscode-ext", "path": "../canbox-vscode-extension", "repo": "..." }
  ]
}
```

**方式 B：package.json workspaces**

```json
// canbox/package.json
{
  "workspaces": ["../canbox-pages", "../canbox-vscode-extension"]
}
```

#### 3.2 对项目管理的支持度

| 维度 | 支持度 | 说明 |
|------|--------|------|
| Git 独立性 | ✅ 高 | 每个项目独立 repo，不需要重建 |
| 统一脚本管理 | ✅ 中高 | 可在主项目写脚本统一管理子项目 |
| AI 工具友好 | ✅ 高 | 每个项目独立打开时，AI 工具上下文清晰 |
| 跨项目搜索 | ⚠️ 中 | 需手动在多个窗口搜索，或用方案2补充 |
| 依赖管理 | ✅ 高 | 可用 workspaces 或 roadmap.json 管理 |
| 发布流程 | ✅ 高 | 各项目独立发布，互不影响 |

---

## 3. 推荐方案

### 3.1 组合方案：方案2 + 方案3

```
~/projects/
├── canbox/                        # 主项目 repo
│   ├── docs/
│   ├── modules/
│   ├── roadmap.json               # 方案3：声明项目关系
│   └── canbox.code-workspace      # 方案2：VSCode 工作区配置
├── canbox-pages/                  # 独立 repo
└── canbox-vscode-extension/       # 独立 repo
```

### 3.2 收益

| 需求 | 满足方式 |
|------|---------|
| 不想重建 git | ✅ 三个独立 repo |
| 统一开发体验 | ✅ 用 `.code-workspace` 统一打开 |
| AI 工具上下文清晰 | ✅ 需要时单独打开项目文件夹 |
| 跨项目搜索 | ✅ Multi-Root Workspace 支持 |
| 新成员理解架构 | ✅ `roadmap.json` 声明项目关系 |

### 3.3 实施步骤

1. **保持三个独立 repo**（不需要重建 git）
2. **创建 `canbox.code-workspace`**（方案2，提升开发体验）
3. **在主项目添加 `roadmap.json`**（方案3，声明项目架构）
4. **更新 `docs/` 文档**，反映新的项目组织结构

---

## 4. 后续行动

- [ ] 创建 `canbox.code-workspace` 文件
- [ ] 创建 `roadmap.json` 声明项目架构
- [ ] 更新 `docs/` 下的相关文档
- [ ] 评估 `package.json` workspaces 是否适用

---

*最后更新：2026-06-03*
