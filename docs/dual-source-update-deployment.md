# 双源更新系统部署指南

## 概述

Canbox 采用双源更新机制，国内用户使用 Gitee 源，海外用户使用 GitHub 源。同时启用增量更新（differential update），解决 Gitee 100M 文件大小限制。

## 仓库架构

| 仓库 | 可见性 | 用途 |
|------|--------|------|
| `canbox` (GitHub) | 私有 | 源代码存储 |
| `canbox` (GitHub) | 公开 | Releases 发布 |
| `canbox-release` (Gitee) | 公开 | Releases 镜像下载 |

## 发布架构

| 平台 | 内容 | 用途 |
|------|------|------|
| GitHub | 完整包 + 增量包 + latest.yml | 主更新源 + 手动下载入口 |
| Gitee (canbox-release) | 完整包 + 增量包 + latest.yml | 国内镜像下载 |

## 发布流程

详细说明请参阅 [Release Workflow 使用指南](./release-workflow.md)。

### 方式一：自动发布（推送 Tag）

推送 Git Tag 即可自动发布到 GitHub 和 Gitee：

```bash
# 1. 确保所有更改已提交
git add .
git commit -m "Release changes"

# 2. 创建 Tag 并推送
git tag v0.4.2
git push origin v0.4.2
```

GitHub Actions 会自动：
1. 构建 AppImage + 增量包
2. 发布到 GitHub Release
3. 同步发布到 Gitee Release

### 方式二：手动发布（可选择平台）

不推送 Tag，直接在 GitHub 网页操作：

1. 进入仓库 → **Actions** 标签
2. 选择 **Release** workflow
3. 点击 **"Run workflow"**
4. 选择构建平台：`all` / `linux` / `windows` / `darwin`
5. 点击运行

详见 [Release Workflow 使用指南](./release-workflow.md)。

## GitHub Actions 配置

### 自动发布 Workflow

文件位置：`.github/workflows/release.yml`

触发条件：
- 推送 `v*` 格式的 Tag（自动构建所有平台）
- 手动触发（可选择构建特定平台）

### 必需的环境变量

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `GITHUB_TOKEN` | GitHub 自动授权 | Actions 自动提供，无需配置 |
| `GITEE_TOKEN` | Gitee Access Token | 需手动配置 |

### 配置 Gitee Access Token

1. 访问 https://gitee.com/personal_access_tokens
2. 点击「生成新令牌」
3. 勾选以下权限：
   - `projects` (项目)
4. 点击「提交」生成 Token
5. 复制 Token

### 创建 Gitee 发布仓库

1. 访问 https://gitee.com/new
2. 创建新仓库，设置为**公开**
3. 仓库名称：`canbox-release`
4. 描述：Canbox Release 镜像下载
5. 不需要初始化 README

### 在 GitHub 仓库添加 Secret

1. 访问 GitHub 仓库 https://github.com/rexlevin/canbox
2. 点击「Settings」→「Secrets and variables」→「Actions」
3. 点击「New repository secret」
4. Name: `GITEE_TOKEN`
5. Secret: 粘贴你的 Gitee Access Token
6. 点击「Add secret」

## electron-builder 配置

### publish 配置

```json
"publish": {
    "provider": "github",
    "owner": "rexlevin",
    "repo": "canbox"
}
```

### differentialPackagePolicy 配置

```json
"linux": {
    "differentialPackagePolicy": "auto"
}
```

| 配置值 | 说明 |
|--------|------|
| `auto` | 自动生成增量包（默认） |
| `always` | 始终生成增量包 |
| `never` | 从不生成增量包 |

## 更新源配置

### 更新源设置（用户端）

用户可以在设置页面选择更新源：

| 选项 | 说明 |
|------|------|
| 自动选择 | 系统根据网络状况智能选择（推荐） |
| GitHub | 固定使用 GitHub 源 |
| Gitee | 固定使用 Gitee 源 |

### Generic Provider URL

客户端根据不同源读取不同的 `latest.yml`：

| 源 | latest.yml 地址 |
|---|-----------------|
| GitHub | `https://github.com/rexlevin/canbox/releases/download/latest/latest-linux.yml` |
| Gitee | `https://gitee.com/rexlevin/canbox-release/releases/download/latest/latest-linux.yml` |

## 文件结构

### GitHub Release

```
v0.4.2/
├── Canbox-0.4.2-linux-x86_64.AppImage     # 完整包
├── Canbox-0.4.2-linux-x86_64-delta.AppImage  # 增量包
└── latest-linux.yml                        # 更新清单
```

### Gitee Release (canbox-release 仓库)

```
v0.4.2/
├── Canbox-0.4.2-linux-x86_64.AppImage     # 完整包（用于手动下载）
├── Canbox-0.4.2-linux-x86_64-delta.AppImage  # 增量包（< 100M）
└── latest-linux.yml                        # 更新清单
```

## 常见问题

### Q: Gitee 上传失败怎么办？

检查 `GITEE_TOKEN` 是否正确配置，以及是否有 `projects` 权限。

### Q: 增量包生成失败？

增量包需要前一个版本的文件。如果没有可用历史，打包会失败。这是正常现象。

### Q: 如何禁用自动发布？

删除 `.github/workflows/release.yml` 文件即可禁用自动发布。

### Q: 如何只发布到 GitHub？

删除 Workflow 文件中「Create Gitee Release」和「Upload to Gitee Release」步骤。

## 相关文档

- [Release Workflow 使用指南](./release-workflow.md)
- [electron-updater 文档](https://www.electron.build/auto-update)
- [electron-builder publish 配置](https://www.electron.build/configuration/publish)
- [Gitee Open API](https://gitee.com/api/v5/swagger#/getV5ReposOwnerRepoReleasesTagTag)
