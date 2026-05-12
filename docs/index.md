# Canbox 文档中心

欢迎访问 Canbox 文档中心！Canbox 是一个轻量级的应用运行时平台，为开发者提供简单、高效的应用分发和管理解决方案。

## 🎯 项目简介

Canbox 是一个轻量级的应用运行时平台，为开发者提供简单、高效的应用分发和管理解决方案。

## ✨ 核心价值

1. **轻量级** - 无需复杂部署，开箱即用
2. **跨平台** - 支持 Windows、macOS、Linux
3. **开发者友好** - 提供完整的开发工具链
4. **应用分发** - 简化的应用发布和管理机制

## 🏗️ 技术架构

### 核心组件
- **前端**: Vue 3 + Composition API + Element Plus
- **后端**: Electron + Node.js
- **数据存储**: electron-store + PouchDB
- **构建工具**: Vite

### 项目结构
```
canbox/
├── dist/                  # 构建输出目录
├── modules/               # 核心模块
├── src/                   # 前端源码
├── main.js                # 主进程入口
└── package.json          # 项目配置
```

## 🚀 核心功能

### 已实现功能
- ✅ 应用管理（安装、卸载、更新）
- ✅ 应用仓库（添加、同步、管理）
- ✅ 应用开发工具（打包、调试）
- ✅ 日志查看器（实时日志、过滤、搜索）
- ✅ 国际化支持（中英文）
- ✅ 自定义字体设置
- ✅ 用户数据路径管理

### 特色功能
- **应用打包**：支持 ASAR 打包，保护应用代码
- **开发环境**：支持热重载和调试工具
- **API 系统**：提供丰富的运行时 API
- **数据存储**：应用独立的数据存储空间

## 👥 目标用户

1. **应用开发者** - 开发 Canbox 应用
2. **普通用户** - 使用 Canbox 应用
3. **技术爱好者** - 探索轻量级应用平台

## 📚 文档结构

### 1. 开发文档
- **development/** - 开发指南、API 参考、国际化支持
  - [开发文档总览](./development/index.md) - 所有开发相关文档索引
  - **API文档**: [中文版](./development/API_CN.md) | [English](./development/API.md)
  - **应用开发指南**: [中文版](./development/APP_DEV_CN.md) | [English](./development/APP_DEV.md)
  - **Canbox开发指南**: [中文版](./development/CANBOX_DEV_CN.md) | [English](./development/CANBOX_DEV.md)

### 2. 路线图
- **roadmap/** - 功能路线图、已完成功能、未来计划
  - [路线图总览](./roadmap/index.md) - 未来开发计划
  - [已完成功能](./roadmap/completed.md) - 已实现的功能列表

### 3. 设计决策
- **design-decisions/** - 技术方案、设计讨论、解决方案
  - [Electron 进程模式与数据访问设计](./design-decisions/electron-process-modes.md) - Window 模式与 Childprocess 模式的进程架构差异及数据访问方案
  - [移动端与桌面端设计讨论](./design-decisions/mobile-desktop.md)
  - [操作反馈UI设计讨论](./design-decisions/operation-feedback.md)

### 4. 变更记录
- **changes/** - 变更管理、已完成变更、归档记录
  - [变更系统说明](./changes/README.md) - 变更记录模板和流程
  - [已完成变更汇总](./changes/completed/README.md) - 所有已完成功能变更

### 5. 旧文档兼容
- **legacy/** - 旧文档重定向，保持向后兼容

## 🌐 多语言支持

所有开发文档都提供中英文双语版本：
- 英文文档：文件名如 `index.md`
- 中文文档：文件名如 `index.zh-CN.md` 或 `_CN.md` 后缀

## 🚀 快速导航

### 新开发者入门
- 从 [开发文档总览](./development/index.md) 开始
- 查看 [API文档](./development/API.md) 了解可用接口

### 应用开发者
- [应用开发指南](./development/APP_DEV.md) - 开发Canbox应用
- [TypeScript配置](./development/APP_DEV.md#typescript-configuration) - 设置开发环境

### 贡献者
- [Canbox开发指南](./development/CANBOX_DEV.md) - 参与项目开发
- [项目结构](./development/CANBOX_DEV.md#project-structure) - 了解代码组织

### 项目管理
- [路线图](./roadmap/index.md) - 功能规划
- [已完成变更](./changes/completed/README.md) - 变更历史

## 📝 文档贡献

欢迎贡献文档改进！请参考：
1. 使用 Markdown 格式
2. 保持中英文同步更新
3. 遵循现有的文档结构
4. 通过 Pull Request 提交

## 🔗 相关资源

- [GitHub 仓库](https://github.com/rexlevin/canbox)
- [问题追踪](https://github.com/rexlevin/canbox/issues)

---

*最后更新：2026-04-07*  
*版本：2.0（合并版）*