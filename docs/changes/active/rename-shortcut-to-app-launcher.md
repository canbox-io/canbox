# shortcutManager 重命名为 appLauncherManager - 2026-06-10

## 📋 基本信息

| 项目 | 内容 |
|------|------|
| **状态** | 🚧 进行中 |
| **优先级** | ⭐⭐⭐ |
| **难度** | 🟢 简单 |
| **预计时间** | 1 小时 |
| **负责人** | lizl6 |

## 🎯 变更概述

将 `shortcutManager` / `shortcutIpcHandler` 模块及所有相关命名重命名为 `appLauncherManager` / `appLauncherIpcHandler`，消除 `shortcut` 一词在"键盘快捷键"与"系统快捷方式"之间的歧义。

## 🔍 问题描述

### 当前状况

`shortcutManager` 模块的实际功能是为已安装的 APP 创建/删除**系统级启动快捷方式**（Windows `.lnk`、Linux `.desktop`）。但 `shortcut` 这个英文词在编程领域更常见的含义是**键盘快捷键**，导致 AI 和开发者容易误读模块用途。

### 用户痛点

AI 辅助编程时反复将 `shortcutManager` 误解为键盘快捷键管理模块，需要多次纠正，降低开发效率。

## 💡 解决方案

### 总体方案

将模块体系中的 `shortcut` 相关命名全部替换为 `launcher` 体系：

- **模块/文件级**：使用 `appLauncher`（明确是 APP 的启动器）
- **内部函数/API/channel/i18n key**：使用 `launcher`（模块上下文已足够明确）

### 改名映射表

| 类型 | 原名 | 新名 |
|------|------|------|
| 文件 | `shortcutManager.js` | `appLauncherManager.js` |
| 文件 | `shortcutIpcHandler.js` | `appLauncherIpcHandler.js` |
| 变量 | `shortcutManager` | `appLauncherManager` |
| 变量 | `shortcutIpcHandler` | `appLauncherIpcHandler` |
| 变量 | `shortcutPath` | `launcherPath` |
| 函数 | `generateShortcuts` | `generateLaunchers` |
| 函数 | `deleteShortcuts` | `deleteLaunchers` |
| 函数 | `initShortcuts` | `initLaunchers` |
| 函数 | `needRegenerateShortcuts` | `needRegenerateLaunchers` |
| 函数 | `initShortcutHandlers` | `initLauncherHandlers` |
| IPC channel | `generate-shortcut` | `generate-launchers` |
| IPC channel | `delete-shortcut` | `delete-launchers` |
| Preload API | `generateShortcut` | `generateLaunchers` |
| Preload API | `deleteShortcut` | `deleteLaunchers` |
| i18n key | `settings.shortcutTitle` | `settings.launcherTitle` |
| i18n key | `settings.createShortcut` | `settings.createLauncher` |
| i18n key | `settings.deleteShortcut` | `settings.deleteLauncher` |
| i18n key | `settings.shortcutCreated` | `settings.launcherCreated` |
| i18n key | `settings.shortcutDeleted` | `settings.launcherDeleted` |

## 📁 修改的文件

### 重命名文件
```
- modules/canbox/main/shortcutManager.js → modules/canbox/main/appLauncherManager.js
- modules/canbox/ipc/shortcutIpcHandler.js → modules/canbox/ipc/appLauncherIpcHandler.js
```

### 修改文件
```
- main.js (require 变量名、函数调用名)
- ipcHandlers.js (require 变量名、init 调用)
- modules/canbox/ipc/appManagerIpcHandler.js (require 变量名、函数调用名)
- preload.js (API 方法名、IPC channel 名)
- src/components/Settings.vue (函数名、i18n key 引用)
- locales/zh-CN.json (i18n key 名)
- locales/en-US.json (i18n key 名)
- .codebuddy/rules/project-info.md (模块列表)
- README.md (引用)
- docs/development/APP_DEV.md (引用)
- docs/changes/completed/*.md (历史引用，2 个文件)
```

### 不修改的文件
```
- package.json (shortcutName 是 electron-builder 配置，与模块无关)
- website-scraper.js (shortcut icon 是 HTML <link rel> 属性)
```

## 🛠️ 实施细节

### 关键实现步骤

1. 重命名 `shortcutManager.js` → `appLauncherManager.js`，更新内部变量和函数名
2. 重命名 `shortcutIpcHandler.js` → `appLauncherIpcHandler.js`，更新内部变量和函数名
3. 更新 `main.js`、`ipcHandlers.js`、`appManagerIpcHandler.js` 中的 require 路径和引用
4. 更新 `preload.js` 中的 API 方法名和 IPC channel 名
5. 更新 `Settings.vue` 中的函数调用和 i18n key 引用
6. 更新 `locales/zh-CN.json` 和 `locales/en-US.json` 中的 i18n key 名（值不变）
7. 更新 `.codebuddy/rules/project-info.md` 模块列表
8. 更新 `README.md`、`docs/` 中的相关引用
9. 构建验证：确保 `npm run build` 无错误

### 技术要点

- i18n key **名称**改变，但**显示文本值**不变
- `createCanboxDesktop` / `needGenerateCanboxDesktop` 函数名保持不变（Canbox 自身 desktop entry）
- 文件重命名使用 `git mv` 保留 Git 历史

## 📊 影响评估

### 功能影响

| 影响范围 | 评估结果 | 说明 |
|----------|----------|------|
| 向后兼容性 | ❌ 不兼容 | API 方法名和 channel 名变化，但仅内部使用 |
| API变更 | ⚠️ 微小变更 | `window.api.generateLaunchers` / `deleteLaunchers` |
| 数据迁移 | ✅ 不需要 | 无数据结构变化 |

### 安全性评估
- [x] 无安全风险

---
*创建时间: 2026-06-10*
*最后更新: 2026-06-10*
