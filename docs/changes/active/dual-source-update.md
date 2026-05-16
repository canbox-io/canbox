# dual-source-update

## 概述

实现双源更新机制：国内用户使用 GitHub 镜像加速源，海外用户继续使用 GitHub 直连。通过代理加速解决国内访问 GitHub 不稳定的问题。

## 背景

- GitHub 在国内访问不稳定，下载速度慢甚至超时
- Gitee 存在 100M release 文件大小限制，Canbox 单平台包约 150M，无法上传
- Gitee Release 不支持 GitHub 风格的 `releases/download/{tag}/{file}` 静态文件 URL，electron-updater 的 Generic Provider 无法直接使用
- 国内已有免费的 GitHub 加速代理服务，可以代理 GitHub Release 文件下载

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
│   ├── githubProvider.js       # GitHub 直连实现
│   └── mirrorProvider.js       # 镜像加速实现
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

**注意**：`githubReleaseProvider.js` 移入 providers 目录，作为 githubProvider 基类；新增 mirrorProvider 替代 giteeProvider。

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
  setUpdateSource,      // 设置更新源（github/mirror/auto）
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

| 平台 | 仓库 | 用途 | 内容 |
|------|------|------|------|
| GitHub | `canbox` (公开) | 主更新源 + 镜像源后端 + 手动下载 | 完整包 + latest.yml |

**说明**：镜像加速源不需要独立的文件存储服务。代理服务直接从 GitHub Release 拉取文件，无需额外上传。

### 智能源选择

```
1. 优先检查用户语言环境 (zh-CN → 镜像加速源)
2. 同时探测两源响应速度（3-5 秒超时）
3. 记录历史成功率，动态调整
```

### 更新源设置

在设置页面提供更新源选项，允许用户手动选择或使用自动模式。

#### UI 设计

```
┌─────────────────────────────────────────┐
│  更新源                                  │
│                                         │
│  ○ GitHub    (海外用户默认)              │
│  ○ 镜像加速   (国内用户默认)              │
│  ● 自动选择   (推荐) ← 默认选中          │
│                                         │
│  当前源: GitHub (自动选择)               │
│                                         │
│  说明：自动选择会根据网络状况             │
│  智能切换最优源                           │
└─────────────────────────────────────────┘
```

#### 选项说明

| 选项 | 行为 | 适用场景 |
|------|------|----------|
| GitHub | 固定使用 GitHub 直连 | 海外用户 / VPN 用户 |
| 镜像加速 | 通过国内代理加速访问 GitHub | 国内用户 / GitHub 不稳定时 |
| 自动选择 | 由系统智能选择最优源 | 大多数用户（推荐） |

#### 自动选择策略

```
1. 语言检测优先
   └─ app.getLocale() === 'zh-CN' → 默认尝试镜像加速源

2. 速度探测（首次或源失败时）
   └─ 同时请求两源 latest.yml，超时 5 秒
   └─ 选择响应最快且成功的源

3. 成功率统计
   └─ 记录每个源的成功/失败次数
   └─ 连续失败 3 次自动切换到备选源
```

#### 降级策略

```
使用镜像加速源更新时：
  1. 通过代理请求 latest-linux.yml → 成功
  2. 通过代理下载 AppImage → 失败（代理不稳定）
  3. 自动降级：切换到 GitHub 直连重试下载
```

#### IPC 接口

```javascript
// 获取当前设置
ipc: 'update-source:get' → { source: 'github'|'mirror'|'auto', current: string }

// 设置更新源
ipc: 'update-source:set', { source: 'github'|'mirror'|'auto' }

// 事件通知
ipc: 'update-source:changed', { from: string, to: string }
```

#### 配置存储

```javascript
// config.json
{
  "updateSource": "auto",  // 'github' | 'mirror' | 'auto'
  "sourceStats": {
    "github": { "success": 10, "failed": 1 },
    "mirror": { "success": 5, "failed": 0 }
  }
}
```

### electron-updater 配置

- 切换为 Generic Provider
- 运行时动态设置 feedURL
- feedURL 根据源不同指向不同地址：
  - GitHub 直连：`https://github.com/rexlevin/canbox/releases/latest/download`
  - 镜像加速：`https://ghproxy.com/https://github.com/rexlevin/canbox/releases/latest/download`

### 镜像加速源工作原理

```
直连 GitHub：
  feedURL = https://github.com/rexlevin/canbox/releases/latest/download
  → 请求 https://github.com/.../latest-linux.yml
  → 下载 https://github.com/.../canbox-linux-x86_64.AppImage

镜像加速：
  feedURL = https://ghproxy.com/https://github.com/rexlevin/canbox/releases/latest/download
  → 请求 https://ghproxy.com/https://github.com/.../latest-linux.yml
  → 下载 https://ghproxy.com/https://github.com/.../canbox-linux-x86_64.AppImage
```

代理做的事：收到请求 → 从 GitHub 拉取对应文件 → 返回给客户端。文件仍然存储在 GitHub Release 上，只是链路经过国内加速。

### 可用代理列表

| 代理 | URL 前缀 | 说明 |
|------|----------|------|
| ghproxy | `https://ghproxy.com` | 老牌，稳定 |
| ghfast | `https://ghfast.top` | 速度较快 |
| ghgo | `https://ghgo.xyz` | 备选 |

代理列表硬编码在 `mirrorProvider.js` 中，后续可扩展为可配置。

## 验收标准

- [x] 模块独立，API 清晰，与主程序边界明确
- [x] 双源支持框架已完成（GitHub/Mirror Provider）
- [x] 智能源选择逻辑已完成（语言检测 + 速度测试）
- [x] 国内用户自动使用镜像加速源更新
- [x] 海外用户继续使用 GitHub 直连
- [x] 用户可手动切换更新源
- [x] 镜像加速源下载失败时自动降级到 GitHub 直连
- [x] GitHub 保持完整包作为唯一文件存储
- [x] electron-builder 配置支持 Generic Provider
- [x] 在设置页面添加"更新源"选项
- [x] GitHub Actions 自动发布

## 实施计划

### ✅ Phase 1: 模块重构 (已完成)

- [x] 创建 `modules/update-center/` 目录结构
- [x] 抽取现有 `autoUpdateManager.js` 到 `autoUpdater.js`
- [x] 创建 `index.js` 统一暴露 API
- [x] 创建 `providers/baseProvider.js` 抽象基类
- [x] 创建 `providers/githubProvider.js` (从原 githubReleaseProvider 重构)
- [x] 创建 `providers/mirrorProvider.js` (替代 giteeProvider)
- [x] 创建 `regionDetector.js` 检测用户地区/语言
- [x] 创建 `speedTester.js` 测试源响应速度
- [x] 更新 `config.js` 添加 updateSource 配置项
- [x] 更新 `events.js` 添加源相关事件
- [x] 更新 `main.js` 和 `ipcHandlers.js` 引用

### Phase 2: 双源实现 (已完成)

- [x] 修改 electron-builder 配置，支持 Generic Provider
- [x] GitHubProvider 已实现
- [x] MirrorProvider 已实现
- [x] 智能源选择逻辑已集成到 autoUpdater
- [x] 在设置页面添加"更新源"选项
- [x] 添加 IPC 接口 `update-source:get` 和 `update-source:set`
- [x] 添加国际化翻译

### Phase 3: 部署配置 (已完成)

- [x] 配置 GitHub Actions 自动发布
- [x] 创建部署文档

#### 发布流程

```
1. 开发者推送 Git Tag
   └─ git tag v0.4.2 && git push origin v0.4.2

2. GitHub Actions 自动触发
   ├─ 构建 AppImage
   └─ 发布到 GitHub (rexlevin/canbox)

3. 国内用户通过镜像加速源自动更新
   └─ 代理从 GitHub Release 拉取文件，无需额外文件存储
```

#### CI 环境变量

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `GITHUB_TOKEN` | GitHub 自动授权 | Actions 自动提供 |

**说明**：镜像加速方案不需要额外的 Token 或第三方服务配置。
