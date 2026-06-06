# launcher

## 概述

在 Canbox 中新增启动器（Launcher）功能，类似 uTools 的快速启动器。用户按全局快捷键弹出搜索框，快速搜索并启动应用（Canbox 已安装应用 + Linux 系统应用）。

## 核心设计

### 功能范围

- **设置页面**：在 `Settings.vue` 添加"启动器"配置分组
- **全局快捷键**：用户可自定义，默认 `Alt+Space`
- **启动器窗口**：无边框、始终置顶、不在任务栏显示
- **应用搜索**：支持中文应用名的拼音匹配（全拼 + 首字母）
- **系统应用读取**：解析 Linux 的 `.desktop` 文件（Phase 1 必须包含）

### 窗口行为

| 行为 | 触发条件 |
|------|----------|
| 显示窗口 | 按全局快捷键 |
| 隐藏窗口 | 失去焦点 / 按 `Esc` / 启动应用后 |
| 启动应用 | 按 `Enter` / 点击应用图标 |

### 窗口样式

- **位置**：屏幕横向居中，纵向距顶三分之一
- **大小**：默认宽度 600px，高度 400px
- **字体**：默认 16px
- **圆角**：默认 12px
- **动画**：无，直接显示/隐藏

### 搜索逻辑

- **无输入时**：显示系统应用列表的前 5 个（按 `.desktop` 文件读取顺序）
- **有输入时**：模糊匹配（中文名、拼音全拼、拼音首字母），显示最匹配的 5 个结果

### 系统应用读取范围（Linux）

| 路径 | 说明 |
|------|------|
| `~/.local/share/applications/` | 用户级应用 |
| `/usr/share/applications/` | 系统级应用 |
| `/var/lib/flatpak/exports/share/applications/` | Flatpak 系统级 |
| `~/.local/share/flatpak/exports/share/applications/` | Flatpak 用户级 |

### 配置文件存储

使用 `canbox.json` 存储启动器配置：

```json
{
  "launcher": {
    "enabled": true,
    "shortcut": "Alt+Space",
    "position": "top-third",
    "width": 600,
    "fontSize": 16,
    "borderRadius": 12,
    "extraShortcutDirs": []
  }
}
```

## 验收标准

- [ ] 按全局快捷键能弹出启动器窗口
- [ ] 窗口位置正确：横向居中，纵向距顶三分之一
- [ ] 搜索应用能正确显示结果（包括中文应用名的拼音匹配）
- [ ] 失去焦点 / 按 `Esc` / 启动应用后窗口自动隐藏
- [ ] 设置页面能配置启动器（启用/禁用、快捷键、样式）
- [ ] 快捷键冲突时能提示用户
- [ ] 系统应用能正确读取（包括 Flatpak 应用）
- [ ] 与现有功能无冲突（特别是开机自启、托盘功能）

## 实施计划

- [ ] 创建 `modules/launcher/` 目录
- [ ] 实现 `launcherManager.js`（窗口管理、快捷键注册）
- [ ] 实现 `systemAppReader.js`（解析 `.desktop` 文件）
- [ ] 实现 `appSearchEngine.js`（模糊搜索 + 拼音匹配）
- [ ] 创建 `src/components/Launcher.vue`（搜索界面）
- [ ] 在 `Settings.vue` 添加"启动器"配置分组
- [ ] 在 `preload.js` 添加 `window.api.launcher` API
- [ ] 在 `ipcHandlers.js` 添加启动器相关 IPC handlers
- [ ] 在 `main.js` 中初始化 `LauncherManager`
- [ ] 确保应用安装后自动创建快捷方式（修改 `appManagerIpcHandler.js`）

---

*创建时间: 2026-06-06*
*最后更新: 2026-06-06*
*版本: 1.0*
