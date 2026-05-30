# Changelog

本文件记录 Canbox 项目的所有重要变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.5.3] - 2026-05-30

### feat | 新功能 / Features

新增创建网页应用功能，输入网址自动抓取网站信息生成桌面 WebApp
支持 WebApp 导航快捷键、右键菜单和同源链接窗口内打开
支持英文别名系统，中文应用名快捷方式包含英文别名便于搜索

Add web app creation feature with auto site info scraping
Support WebApp navigation shortcuts, context menu and same-origin link handling
Add English alias system for Chinese app shortcuts

### docs | 文档 / Documentation

更新变更文档，新增 web-app-creator 功能记录

Update change docs with web-app-creator feature record

## [0.5.2] - 2026-05-28

### fix | 问题修复 / Bug Fixes

修复 sudo 模块在 Node.js v22+ 下因 util.isObject 移除导致的提权执行失败问题
替换 sudo-prompt 为 @vscode/sudo-prompt 以兼容 Electron v41
修复 canbox.sudo.exec 错误传播链中 reject 传字符串导致 err.message 为 undefined 的问题
支持 name 参数传入中文等非 ASCII 字符，内部自动净化为系统认证对话框可接受的格式

Fix sudo module failure on Node.js v22+ due to removed util.isObject API
Replace sudo-prompt with @vscode/sudo-prompt for Electron v41 compatibility
Fix error propagation in canbox.sudo.exec where reject passed string instead of Error object
Support non-ASCII characters in name parameter with automatic sanitization for system auth dialogs

## [0.5.1] - 2026-05-28

### feat | 新功能 / Features

文件任务记录持久化存储，重启后自动恢复任务和浮窗显示
新增 interrupted 状态标记重启时中断的任务
支持单个删除、批量清理已完成任务、全部清理任务记录
新增 30 天过期任务清理功能
文件任务面板新增 ESC 快捷键收起

Persist file task records to PouchDB, auto-restore tasks and panel on restart
Add interrupted state for tasks interrupted by restart
Support single delete, batch clear completed tasks, and clear all task records
Add 30-day expired task cleanup feature
Add ESC shortcut to collapse file task panel

### fix | 问题修复 / Bug Fixes

修复操作历史浮动图标拖动超出窗口边界导致不可见的问题

Fix operation history floating icon being dragged outside window bounds and becoming invisible

### docs | 文档 / Documentation

新增文件任务持久化存储设计文档

Add file task persistence design document

## [0.5.0] - 2026-05-27

### fix | 问题修复 / Bug Fixes

修复 --app-id 启动时 X11 下渲染首帧异常及 fallback 误显示窗口

Fix renderer first-frame anomaly and fallback incorrectly showing window on --app-id launch under X11

## [0.4.9] - 2026-05-27

### feat | 新功能 / Features

添加应用导出功能，支持将已安装的 APP 打包为 ZIP 文件离线分享
优化文件任务面板的折叠展开交互，收起状态改为小图标避免遮挡内容

Add app export feature to package installed apps as ZIP files for offline sharing
Optimize file task panel collapse/expand interaction, collapsed state uses small icon to avoid blocking content

### docs | 文档 / Documentation

添加 app-export 功能变更文档

Add app-export feature change document

### chore | 维护 / Maintenance

更新版本号至 0.4.9 并归档 APP 导出功能文档

Update version to 0.4.9 and archive app-export feature document

## [0.4.8] - 2026-05-25

### feat | 新功能 / Features

APP 外部链接自动使用默认浏览器打开，新增 canbox.openUrl API

Automatically open external URLs in default browser for APPs, add canbox.openUrl API

### docs | 文档 / Documentation

更新变更列表和文档

Update change list and documentation

## [0.4.7] - 2026-05-21

### feat | 新功能 / Features

支持更新后台下载与进度查看
升级版本至 v0.4.6 并优化更新对话框交互体验

Support background download with progress tracking
Upgrade to v0.4.6 and improve update dialog interaction

### ci | CI/CD / CI/CD

添加前端构建步骤（修复 CI 构建缺失 Vite 前端页面问题）

Add frontend build step to CI (fix missing Vite-built pages in CI artifacts)

### docs | 文档 / Documentation

更新 CHANGELOG

Update CHANGELOG

## [0.4.5] - 2026-05-21

### feat | 新功能 / Features

新增操作历史记录功能，支持多语言和分页加载
实现双源更新系统及跨平台自动发布流程
增强 Zoom 功能：键盘快捷键 + 设置界面控制

Add operation history with i18n and pagination
Implement dual-source update system and cross-platform auto-release
Enhance Zoom with keyboard shortcuts and Settings UI

### chore | 维护 / Maintenance

将 .codebuddy 添加到 gitignore

Add .codebuddy to gitignore

### docs | 文档 / Documentation

添加操作历史记录文档
添加分级通知和操作历史功能设计文档
完成双源更新机制文档并归档
添加变更工作流文档

Add operation history documentation
Add notification guidelines documentation
Complete dual-source update documentation
Add change workflow documentation

## [0.4.0] - 2026-05-09

### feat | 新功能 / Features

新增文件任务管理器（File Task Manager），统一管理下载、导入等文件操作任务
Electron 从 35.7.2 升级到 41.2.1，Node.js 升级到 23+
新增 App Locale API（window.canbox.getLocale()），应用可获取 Canbox 当前语言环境
打包、下载、添加仓库操作添加视觉反馈
新增字体设置功能
新增日志查看器窗口，支持实时过滤和搜索
APP 列表 UI 升级
自动更新支持后台静默下载
支持自定义用户数据存储路径
优化数据迁移后重启体验

Add File Task Manager for unified file operation management
Upgrade Electron from 35.7.2 to 41.2.1, Node.js to 23+
Add App Locale API (window.canbox.getLocale()) for apps
Add visual feedback for pack, download, repo operations
Add font settings
Add log viewer window with real-time filtering and search
Upgrade APP list UI
Auto-update with silent download
Custom user data path
Improved post-migration restart UX

### chore | 维护 / Maintenance

Linux AppImage --no-sandbox 沙箱权限解决方案
日志系统统一化

--no-sandbox solution for Linux AppImage
Logging unification

## [0.3.4] - 2026-04-16

### feat | 新功能 / Features

为 APP 提供 window.canbox.getLocale() API，获取 Canbox 当前语言环境

Add window.canbox.getLocale() API for apps to get Canbox locale

### docs | 文档 / Documentation

更新 API 文档（中英文）
完善变更记录归档系统

Update API documentation (Chinese and English)
Complete change log archiving system

### API Usage | API 使用

```javascript
const locale = window.canbox.getLocale(); // 'zh-CN' or 'en-US'
```

## [0.2.7] - 2026-03-21

### Changed

- 优化自动更新错误处理和配置管理

## [0.2.6] - 2026-03-21

### Added

- 为关于标签添加更新状态提示

### Changed

- 增强自动更新错误处理和超时保护

## [0.2.5] - 2026-03-18

### Added

- 支持 Linux AppImage 更新模式
- 新增关于页面及版本信息功能

### Changed

- 优化自动更新流程并支持手动重启
- 重构 About 页面布局样式

## [0.2.4] - 2026-03-09

### Added

- 添加自动更新功能

## [0.2.3] - 2026-03-06

### Added

- 添加子进程模式支持应用启动

## [0.2.0-pre] - 2026-02-06

### Added

- 恢复 APP 窗口位置和最大化状态

### Changed

- 更新 README 文档添加 APP 导入功能说明

## [0.1.4] - 2026-02-03

### Added

- 添加窗口状态保存和恢复功能
- 添加窗口最大化状态保存与恢复
- 添加全局字体设置功能
- 为 CustomDrawer 添加 ESC 键关闭功能
- 为应用和仓库添加信息展示功能
- 为应用列表添加 Markdown 渲染功能
- 为 Linux 平台添加自动处理 --no-sandbox 的打包后脚本

### Fixed

- 修复窗口最大化时的位置和闪烁问题
- 使用 getBounds 替代 getContentBounds 获取窗口边界
- 优化窗口状态保存和位置验证逻辑

### Changed

- 使用 CustomDrawer 组件替换 el-drawer
- 提取并行获取应用详情的公共方法
- 完善打包环境下 canbox.d.ts 文件的路径处理逻辑

## [0.0.4] - 2025-10-30

### Added

- 初始版本基础功能
