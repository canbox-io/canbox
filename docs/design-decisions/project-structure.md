# Canbox 多项目管理方案分析

> **状态：** 已实施
> **日期：** 2026-06-06
> **作者：** Canbox Team

## 1. 背景

随着 Canbox 项目的发展，需要管理多个相关但独立的项目：

| 项目                   | 说明                               | 状态     |
| ---------------------- | ---------------------------------- | -------- |
| **canbox**       | Canbox 主程序（Electron 桌面应用） | 活跃开发 |
| **canbox-pages** | Canbox 官网与文档站                | 活跃开发 |

当前每个项目有独立的 git 仓库。随着项目数量增加，需要一套合理的多项目管理办法。

未来可能新增 canbox-vscode-extension 等项目，本方案的架构设计已预留扩展空间。

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

创建 `canbox.code-workspace` 文件（已实施，位于 canbox 项目根目录）：

```json
{
  "folders": [
    { "name": "canbox",       "path": "." },
    { "name": "canbox-pages",  "path": "../canbox-pages" }
  ],
  "settings": {}
}
```

> **注意：** 当未来新增项目（如 canbox-vscode-extension）时，只需在 `folders` 数组中添加一项即可，无需其他改动。

用 VSCode 打开该文件即可在一个窗口里管理所有项目。

#### 2.3 优点

| 优点               | 说明                                       |
| ------------------ | ------------------------------------------ |
| 统一开发体验       | 一个窗口管理三个项目                       |
| 跨项目搜索         | Ctrl+Shift+F 搜索所有项目                  |
| 共享配置           | workspace 级别的 settings、extensions 推荐 |
| **Git 独立** | 每个项目保持独立 repo，不需要重建          |
| 调试配置           | 可配置跨项目的 Debug 组合                  |

#### 2.4 缺点

| 缺点                      | 说明                                              |
| ------------------------- | ------------------------------------------------- |
| **AI 工具支持参差** | 多项目上下文下，AI 助手可能只识别当前激活的文件夹 |
| 终端管理复杂              | 需手动切换终端到对应项目目录                      |
| 部分插件不友好            | 有些插件只认第一个或当前激活的文件夹              |

#### 2.5 AI 工具对 Multi-Root Workspace 的支持

| 工具                     | 支持情况                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------- |
| **CodeBuddy**      | 有限支持。能读取打开的文件，但"工作区根目录"概念在多根下模糊。建议操作时有明确项目路径 |
| **Trae**           | 类似，建议实际测试确认                                                                 |
| **GitHub Copilot** | 较差，通常只认当前激活的文件夹作为上下文                                               |
| **Cline**          | 较差，file reading 基于单个 workspace folder                                           |

**缓解方案：** 需要时单独打开某个项目文件夹，让 AI 工具获得清晰上下文。

#### 2.6 日常使用方式

**workspace 是日常开发的唯一入口，不需要来回切换。**

```
日常开发（99% 的时间）        AI 需要精确上下文时（偶尔）
┌─────────────────────┐      ┌─────────────────────┐
│ 双击 canbox.code-   │      │ 单独用 VSCode 打开   │
│ workspace           │      │ canbox/ 文件夹       │
│                     │      │                     │
│ 一个窗口，两个项目   │      │ 给 AI 工具清晰上下文 │
│ 终端下拉切换目录     │      │                     │
│ Ctrl+Shift+F 跨项目 │      │ 完成后切回 workspace │
└─────────────────────┘      └─────────────────────┘
```

你**不需要**一会打开 `canbox/` 文件夹、一会又切到 workspace。workspace 就是日常开发的唯一入口。

#### 2.7 AI 数据目录

`.codebuddy` / `.trae` 等 AI 工具的本地数据目录**保持在各项目根目录下，不需要变更**：

```
~/projects/
├── canbox/
│   ├── .codebuddy/              ← canbox 项目的 AI 数据，不变
│   ├── .trae/                   ← 同上
│   ├── canbox.code-workspace
│   └── ...
└── canbox-pages/
    ├── .codebuddy/              ← canbox-pages 自己的 AI 数据（自动生成）
    └── ...
```

- AI 工具的数据目录是**按项目文件夹**管理的，不是按 `.code-workspace` 文件
- 用 workspace 打开时，AI 工具在自己的项目目录下读写数据，和现在完全一样
- 两个项目的 AI 数据**互不干扰**

---

### 方案3：路标文件（Project Roadmap）

保持三个独立 repo，在主项目中用配置文件声明子项目的位置和关系。

#### 3.1 实现方式

**方式 A：纯声明式路标文件（已实施 → `roadmap.json`）**

```json
{
  "projects": [
    {
      "name": "canbox",
      "description": "Canbox 主程序 —— 基于 Electron 的桌面应用集合",
      "path": ".",
      "type": "electron-app"
    },
    {
      "name": "canbox-pages",
      "description": "Canbox 官网与文档站",
      "path": "../canbox-pages",
      "type": "website"
    }
  ]
}
```

> 未来新增项目时，在 `projects` 数组中追加即可。

**方式 B：package.json workspaces**（待评估）

```json
// canbox/package.json（示例，未启用）
{
  "workspaces": ["../canbox-pages"]
}
```

#### 3.2 对项目管理的支持度

| 维度         | 支持度  | 说明                                  |
| ------------ | ------- | ------------------------------------- |
| Git 独立性   | ✅ 高   | 每个项目独立 repo，不需要重建         |
| 统一脚本管理 | ✅ 中高 | 可在主项目写脚本统一管理子项目        |
| AI 工具友好  | ✅ 高   | 每个项目独立打开时，AI 工具上下文清晰 |
| 跨项目搜索   | ⚠️ 中 | 需手动在多个窗口搜索，或用方案2补充   |
| 依赖管理     | ✅ 高   | 可用 workspaces 或 roadmap.json 管理  |
| 发布流程     | ✅ 高   | 各项目独立发布，互不影响              |

---

## 3. 推荐方案（已实施）

### 3.1 组合方案：方案2 + 方案3

```
~/projects/                       # 实际路径：/depot/cargo/
├── canbox/                        # 主项目 repo
│   ├── .codebuddy/                # AI 数据（不动）
│   ├── docs/
│   ├── modules/
│   ├── src/
│   ├── canbox.code-workspace      # ✅ 已创建 —— 日常开发入口
│   └── roadmap.json               # ✅ 已创建 —— 项目架构声明
└── canbox-pages/                  # 独立 repo
    ├── .codebuddy/                # 自动生成
    └── ...
```

### 3.2 收益

| 需求              | 满足方式                                        |
| ----------------- | ----------------------------------------------- |
| 不想重建 git      | ✅ 独立 repo，互不影响                          |
| 统一开发体验      | ✅ 用 `.code-workspace` 作为日常唯一入口      |
| 不需要切换目录    | ✅ 双击 workspace 一个窗口搞定所有项目          |
| AI 数据目录不变   | ✅`.codebuddy` 保持在各项目根目录             |
| AI 工具上下文清晰 | ✅ 需要时单独打开项目文件夹                     |
| 跨项目搜索        | ✅ Multi-Root Workspace 支持                    |
| 新成员理解架构    | ✅`roadmap.json` 声明项目关系                 |
| 未来扩展          | ✅ 新增项目只需在 workspace 和 roadmap 各加一项 |

### 3.3 实施步骤

1. ✅ **保持独立 repo**（不需要重建 git）
2. ✅ **创建 `canbox.code-workspace`**（日常开发入口）
3. ✅ **创建 `roadmap.json`**（声明项目架构）
4. ✅ **更新本文档**（反映实施结果）

---

## 4. 后续行动

- [X] 创建 `canbox.code-workspace` 文件
- [X] 创建 `roadmap.json` 声明项目架构
- [X] 更新 `docs/` 下的相关文档
- [X] 评估 `package.json` workspaces 是否适用

---

*最后更新：2026-06-06*
