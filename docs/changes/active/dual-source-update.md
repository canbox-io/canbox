# dual-source-update

## 概述

实现双源更新机制：国内用户使用 Gitee 镜像源，海外用户继续使用 GitHub。同时启用增量更新（differential update），解决 Gitee 100M 文件大小限制问题。

## 背景

- GitHub 在国内访问不稳定
- Gitee 存在 100M release 文件大小限制
- Canbox 单平台包约 150M，无法直接上传 Gitee
- electron-updater 支持 differential update，增量包远小于完整包

## 架构设计

### Module 边界

将 `auto-update` 相关代码重构为独立的 module `modules/update-center/`，对外暴露统一 API：

```
modules/update-center/
├── index.js                    # Module 入口，暴露核心 API
├── autoUpdater.js              # electron-updater 封装
├── regionDetector.js           # 地区检测（语言/IP）
├── speedTester.js              # 源速度测试
├── providers/                  # 更新源提供商
│   ├── baseProvider.js         # 抽象基类
│   ├── githubProvider.js       # GitHub 实现
│   └── giteeProvider.js        # Gitee 实现
├── config.js                   # 配置管理
└── events.js                   # 事件定义
```

### 迁移策略

采用 **方案 B（合并）**：将 `modules/auto-update/` 重命名为 `modules/update-center/`，在原有代码基础上扩展。

```
原目录                          新目录
modules/auto-update/     →      modules/update-center/
├── index.js            →      index.js (重新导出)
├── autoUpdateManager.js →     autoUpdater.js (重命名 + 扩展)
├── autoUpdateConfig.js  →      config.js (重命名)
├── autoUpdateEvents.js  →      events.js (重命名)
├── githubReleaseProvider.js →   providers/githubProvider.js (移动 + 重构)
```

**注意**：`githubReleaseProvider.js` 移入 providers 目录，作为 githubProvider 基类；新增 giteeProvider。

### 暴露 API

```javascript
// 模块入口导出
module.exports = {
  // 核心功能
  checkForUpdates,      // 检查更新
  downloadUpdate,       // 下载更新
  installUpdate,        // 安装更新
  
  // 配置
  getUpdateSource,      // 获取当前更新源
  setUpdateSource,      // 设置更新源（github/gitee/auto）
  getConfig,            // 获取更新配置
  saveConfig,           // 保存更新配置
  
  // 状态
  getStatus,           // 获取当前更新状态
  onUpdateEvent,       // 订阅更新事件
  
  // 工具
  skipVersion,         // 跳过版本
  clearSkippedVersions // 清除跳过列表
};
```

### 设计原则

- **单一职责**：每个文件只负责一类功能
- **依赖注入**：providers 可替换，方便测试
- **事件驱动**：通过事件与主程序通信
- **配置隔离**：更新源、跳过版本等配置独立管理

### 发布架构

| 平台 | 用途 | 内容 |
|------|------|------|
| GitHub | 主更新源 + 手动下载 | 完整包 + 增量包 + latest.yml |
| Gitee | 国内镜像 | 增量包 + latest.yml |

### 智能源选择

```
1. 优先检查用户语言环境 (zh-CN → 国内源)
2. 同时探测两源响应速度（3-5 秒超时）
3. 记录历史成功率，动态调整
```

### electron-updater 配置

- 切换为 Generic Provider
- 运行时动态设置 feedURL
- 增量更新自动生效（electron-builder 打包时生成）

## 验收标准

- [ ] 模块独立，API 清晰，与主程序边界明确
- [ ] 国内用户自动使用 Gitee 源更新
- [ ] 海外用户继续使用 GitHub 源
- [ ] 用户可手动切换更新源
- [ ] Gitee 仅上传增量包（< 100M）
- [ ] GitHub 保持完整包作为手动下载入口
- [ ] 自动检测失败时有合理的降级策略

## 实施计划

### Phase 1: 模块重构

- [ ] 创建 `modules/update-center/` 目录结构
- [ ] 抽取现有 `autoUpdateManager.js` 到 `autoUpdater.js`
- [ ] 创建 `index.js` 统一暴露 API
- [ ] 创建 `providers/baseProvider.js` 抽象基类

### Phase 2: 双源实现

- [ ] 修改 electron-builder 配置，支持 Generic Provider
- [ ] 创建 `providers/githubProvider.js`
- [ ] 创建 `providers/giteeProvider.js`
- [ ] 创建 `regionDetector.js` 检测用户地区/语言
- [ ] 创建 `speedTester.js` 测试源响应速度

### Phase 3: 功能集成

- [ ] 修改 AutoUpdateManager，支持动态切换 feedURL
- [ ] 实现智能源选择逻辑
- [ ] 在设置页面添加"更新源"选项
- [ ] 配置 Gitee Release 上传流程
