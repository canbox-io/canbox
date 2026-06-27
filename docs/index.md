# Canbox 开发文档

欢迎来到Canbox开发文档！本目录包含所有开发相关的文档，分为三个主要类别：API文档、应用开发指南和Canbox开发指南。

## 📚 文档概览

### 1. API文档
Canbox提供的所有API接口文档，包含完整的参数说明和代码示例。

| 文档 | 语言 | 描述 |
|------|------|------|
| [API_CN.md](./API_CN.md) | 中文 | Canbox API完整文档（中文版） |
| [API.md](./API.md) | English | Canbox API完整文档（英文版） |

**包含的API模块**：
- **store** - 数据存储API（基于electron-store）
- **db** - 数据库API（基于PouchDB）
- **window** - 窗口管理API
- **sudo** - 系统权限API（跨平台提升权限）
- **dialog** - 对话框API（Electron对话框封装）
- **Lifecycle** - 应用生命周期API

### 2. 应用开发指南
如何在Canbox平台上开发应用的完整指南。

| 文档 | 语言 | 描述 |
|------|------|------|
| [APP_DEV_CN.md](./APP_DEV_CN.md) | 中文 | 应用开发指南（中文版） |
| [APP_DEV.md](./APP_DEV.md) | English | 应用开发指南（英文版） |

**主要内容**：
- 应用文件结构说明
- TypeScript/JavaScript配置指南
- `app.json`配置文件详解
- `uat.dev.json`开发环境配置
- 应用开发最佳实践

### 3. Canbox开发指南
参与Canbox项目本身的开发指南。

| 文档 | 语言 | 描述 |
|------|------|------|
| [CANBOX_DEV_CN.md](./CANBOX_DEV_CN.md) | 中文 | Canbox开发指南（中文版） |
| [CANBOX_DEV.md](./CANBOX_DEV.md) | English | Canbox开发指南（英文版） |

**主要内容**：
- 项目结构和架构
- 开发环境设置
- 调试和测试方法
- 构建和打包指南
- 贡献流程说明

## 🤖 AI Agent使用指南

### 当您需要：
1. **了解Canbox API** → 查看 [API_CN.md](./API_CN.md) 或 [API.md](./API.md)
2. **开发Canbox应用** → 查看 [APP_DEV_CN.md](./APP_DEV_CN.md) 或 [APP_DEV.md](./APP_DEV.md)
3. **参与Canbox开发** → 查看 [CANBOX_DEV_CN.md](./CANBOX_DEV_CN.md) 或 [CANBOX_DEV.md](./CANBOX_DEV.md)

### 快速查找技巧：
- 使用 `Ctrl+F` 在文档中搜索关键词
- API文档按功能模块组织，可直接跳转到相关章节
- 所有文档都有对应的中英文版本

## 🎯 使用场景

### 场景1：开发Canbox应用
1. 阅读 [APP_DEV.md](./APP_DEV.md) 了解应用开发基础
2. 参考 [API.md](./API.md) 使用Canbox提供的API
3. 按照指南创建 `app.json` 和应用文件

### 场景2：为Canbox贡献代码
1. 阅读 [CANBOX_DEV.md](./CANBOX_DEV.md) 了解项目结构
2. 按照开发指南设置环境
3. 实现功能后提交Pull Request

### 场景3：API参考和调试
1. 直接在 [API_CN.md](./API_CN.md) 中查找所需API
2. 查看参数说明和示例代码
3. 在应用中测试API调用

## 🔗 相关资源

### 在线资源
- [Canbox GitHub仓库](https://github.com/canbox-io/canbox)
- [Electron文档](https://www.electronjs.org/docs)
- [PouchDB文档](https://pouchdb.com/guides/)

### 本地文档
- [项目概述](../../overview/index.md) - Canbox项目整体介绍
- [变更记录](../changes/completed/README.md) - 已完成的功能变更
- [路线图](../roadmap/index.md) - 未来开发计划

## 📝 文档更新

这些文档是Canbox项目的重要组成部分：
- **API文档**：当API有新增或修改时需要更新
- **应用开发指南**：当开发流程或规范变化时需要更新
- **Canbox开发指南**：当项目结构或开发流程变化时需要更新

**注意**：这些文档在Canbox中可能被引用或提供下载，请不要删除或重命名它们。

---

*最后更新：2026-04-07*  
*版本：1.0*