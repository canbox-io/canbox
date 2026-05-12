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

| 平台 | 仓库 | 用途 | 内容 |
|------|------|------|------|
| GitHub | `canbox` (公开) | 主更新源 + 手动下载 | 完整包 + 增量包 + latest.yml |
| Gitee | `canbox-release` (公开) | 国内镜像下载 | 完整包 + 增量包 + latest.yml |

**注意**：Gitee 使用独立的 `canbox-release` 仓库，避免暴露源代码。

### 智能源选择

```
1. 优先检查用户语言环境 (zh-CN → 国内源)
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
│  ○ Gitee     (国内用户默认)              │
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
| GitHub | 固定使用 GitHub 源 | 海外用户 / VPN 用户 |
| Gitee | 固定使用 Gitee 源 | 国内用户 / GitHub 不稳定时 |
| 自动选择 | 由系统智能选择最优源 | 大多数用户（推荐） |

#### 自动选择策略

```
1. 语言检测优先
   └─ app.getLocale() === 'zh-CN' → 默认尝试 Gitee

2. 速度探测（首次或源失败时）
   └─ 同时请求两源 latest.yml，超时 5 秒
   └─ 选择响应最快且成功的源

3. 成功率统计
   └─ 记录每个源的成功/失败次数
   └─ 连续失败 3 次自动切换到备选源
```

#### IPC 接口

```javascript
// 获取当前设置
ipc: 'update-source:get' → { source: 'github'|'gitee'|'auto', current: string }

// 设置更新源
ipc: 'update-source:set', { source: 'github'|'gitee'|'auto' }

// 事件通知
ipc: 'update-source:changed', { from: string, to: string }
```

#### 配置存储

```javascript
// config.json
{
  "updateSource": "auto",  // 'github' | 'gitee' | 'auto'
  "sourceStats": {
    "github": { "success": 10, "failed": 1 },
    "gitee": { "success": 5, "failed": 0 }
  }
}
```

### electron-updater 配置

- 切换为 Generic Provider
- 运行时动态设置 feedURL
- 增量更新自动生效（electron-builder 打包时生成）

## 验收标准

- [x] 模块独立，API 清晰，与主程序边界明确
- [x] 双源支持框架已完成（GitHub/Gitee Provider）
- [x] 智能源选择逻辑已完成（语言检测 + 速度测试）
- [x] 国内用户自动使用 Gitee 源更新
- [x] 海外用户继续使用 GitHub 源
- [x] 用户可手动切换更新源
- [x] Gitee 仅上传增量包（< 100M）
- [x] GitHub 保持完整包作为手动下载入口
- [x] electron-builder 配置支持 Generic Provider
- [x] 配置 Gitee Release 上传流程
- [x] 在设置页面添加"更新源"选项
- [x] GitHub Actions 自动发布

## 实施计划

### ✅ Phase 1: 模块重构 (已完成)

- [x] 创建 `modules/update-center/` 目录结构
- [x] 抽取现有 `autoUpdateManager.js` 到 `autoUpdater.js`
- [x] 创建 `index.js` 统一暴露 API
- [x] 创建 `providers/baseProvider.js` 抽象基类
- [x] 创建 `providers/githubProvider.js` (从原 githubReleaseProvider 重构)
- [x] 创建 `providers/giteeProvider.js` (新增)
- [x] 创建 `regionDetector.js` 检测用户地区/语言
- [x] 创建 `speedTester.js` 测试源响应速度
- [x] 更新 `config.js` 添加 updateSource 配置项
- [x] 更新 `events.js` 添加源相关事件
- [x] 更新 `main.js` 和 `ipcHandlers.js` 引用

### Phase 2: 双源实现 (已完成)

- [x] 修改 electron-builder 配置，支持 Generic Provider
- [x] GitHubProvider 已实现
- [x] GiteeProvider 已实现
- [x] 智能源选择逻辑已集成到 autoUpdater
- [x] 在设置页面添加"更新源"选项
- [x] 添加 IPC 接口 `update-source:get` 和 `update-source:set`
- [x] 添加国际化翻译

### Phase 3: 部署配置 (已完成)

- [x] 配置 Gitee Release 上传流程
- [x] 启用 differential update 打包配置
- [x] 配置 GitHub Actions 自动发布
- [x] 创建部署文档

#### 发布流程

```
1. 开发者推送 Git Tag
   └─ git tag v0.4.2 && git push origin v0.4.2

2. GitHub Actions 自动触发
   ├─ 构建 AppImage + 增量包
   ├─ 发布到 GitHub (rexlevin/canbox)
   └─ 同步发布到 Gitee (rexlevin/canbox-release)

3. 两个平台同步拥有
   ├─ GitHub: 完整包 + 增量包 + latest.yml
   └─ Gitee: 完整包 + 增量包 + latest.yml
```

#### CI 环境变量

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `GITHUB_TOKEN` | GitHub 自动授权 | Actions 自动提供 |
| `GITEE_TOKEN` | Gitee Access Token | 需在 Gitee 设置 |

#### Gitee Access Token 配置

1. 访问 https://gitee.com/personal_access_tokens
2. 点击"生成新令牌"
3. 勾选 `projects` 权限
4. 创建后复制 token
5. 在 GitHub 仓库 Settings → Secrets 中添加 `GITEE_TOKEN`

#### 创建 Gitee 发布仓库

1. 访问 https://gitee.com/new
2. 创建新仓库，设置为**公开**
3. 仓库名称：`canbox-release`
4. 不需要初始化 README
