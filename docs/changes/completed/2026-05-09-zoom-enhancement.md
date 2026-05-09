# zoom-enhancement

## 概述

增强 Zoom 功能：增加键盘快捷键（Ctrl++/Ctrl+-/Ctrl+0），在设置界面提供可视化控制和状态显示。

## 核心设计

### 快捷键
| 快捷键 | 功能 |
|--------|------|
| `Ctrl++` / `Ctrl+=` | Zoom +0.1 |
| `Ctrl+-` | Zoom -0.1 |
| `Ctrl+0` | 重置为 1.0 |

### 范围限制
- 最小值：0.5
- 最大值：2.0
- 步进值：0.1

### 设置界面 UI
- 显示当前 zoom 值（格式：`1.0`）
- +/- 按钮控制
- 重置按钮（恢复 1.0）
- 快捷键提示显示在按钮上方

## 实施计划

- [x] 修改 `src/main.js`：增加键盘快捷键监听
- [x] 修改 `src/components/Settings.vue`：增加 zoom 显示和控制 UI
- [x] 修改 `locales/en-US.json`：增加国际化文本
- [x] 修改 `locales/zh-CN.json`：增加国际化文本

## 实际修改的文件

- `src/main.js` - 增加 Ctrl++/Ctrl+-/Ctrl+0 键盘快捷键
- `src/components/Settings.vue` - 增加 zoom 控制 UI
- `src/stores/zoomStore.js` - **新建** Pinia store 统一管理 zoom 状态
- `locales/en-US.json` - 增加国际化
- `locales/zh-CN.json` - 增加国际化
- `ipcHandlers.js` - 发送 `zoom-changed` 事件
- `preload.js` - 暴露 `zoom.onChanged` 接口

## 关键实现细节

- 使用 **Pinia** 状态管理，实现 Ctrl+滚轮/键盘/设置界面三处状态同步
- `zoomStore.init()` 统一获取初始值并监听变化
