# 双源更新系统部署指南

## 概述

Canbox 采用双源更新机制，国内用户使用 GitHub 镜像加速源，海外用户使用 GitHub 直连。通过国内代理加速解决 GitHub 访问不稳定的问题。

## 仓库架构

| 仓库 | 可见性 | 用途 |
|------|--------|------|
| `canbox` (GitHub) | 公开 | 源代码 + Releases 发布 |

**说明**：镜像加速方案不需要独立的文件存储服务。代理服务直接从 GitHub Release 拉取文件，无需额外上传到第三方平台。

## 发布架构

| 源 | feedURL | 用途 |
|---|---------|------|
| GitHub 直连 | `https://github.com/rexlevin/canbox/releases/latest/download` | 海外用户 |
| 镜像加速 | `https://ghproxy.com/https://github.com/rexlevin/canbox/releases/latest/download` | 国内用户 |

## 发布流程

详细说明请参阅 [Release Workflow 使用指南](./release-workflow.md)。

### 方式一：自动发布（推送 Tag）

推送 Git Tag 即可自动发布到 GitHub：

```bash
# 1. 确保所有更改已提交
git add .
git commit -m "Release changes"

# 2. 创建 Tag 并推送
git tag v0.4.2
git push origin v0.4.2
```

GitHub Actions 会自动：
1. 构建 AppImage
2. 发布到 GitHub Release

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

**说明**：镜像加速方案不需要额外的 Token 或第三方服务配置。

## electron-builder 配置

### publish 配置

```json
"publish": {
    "provider": "github",
    "owner": "rexlevin",
    "repo": "canbox"
}
```

## 更新源配置

### 更新源设置（用户端）

用户可以在设置页面选择更新源：

| 选项 | 说明 |
|------|------|
| 自动选择 | 系统根据网络状况智能选择（推荐） |
| GitHub | 固定使用 GitHub 直连 |
| 镜像加速 | 通过国内代理加速访问 GitHub |

### Generic Provider URL

客户端根据不同源读取不同的 `latest.yml`：

| 源 | latest.yml 地址 |
|---|-----------------|
| GitHub 直连 | `https://github.com/rexlevin/canbox/releases/latest/download/latest-linux.yml` |
| 镜像加速 | `https://ghproxy.com/https://github.com/rexlevin/canbox/releases/latest/download/latest-linux.yml` |

## 文件结构

### GitHub Release

```
v0.4.2/
├── canbox-linux-x86_64.AppImage     # 完整包
└── latest-linux.yml                  # 更新清单
```

## 镜像加速源工作原理

```
直连 GitHub：
  feedURL = https://github.com/rexlevin/canbox/releases/latest/download
  → 请求 latest-linux.yml
  → 下载 canbox-linux-x86_64.AppImage

镜像加速：
  feedURL = https://ghproxy.com/https://github.com/rexlevin/canbox/releases/latest/download
  → 代理从 GitHub 拉取 latest-linux.yml → 返回给客户端
  → 代理从 GitHub 拉取 canbox-linux-x86_64.AppImage → 返回给客户端
```

文件仍然存储在 GitHub Release 上，代理只做链路加速，无需额外上传。

### 可用代理列表

| 代理 | URL 前缀 | 说明 |
|------|----------|------|
| ghproxy | `https://ghproxy.com` | 老牌，稳定 |
| ghfast | `https://ghfast.top` | 速度较快 |
| ghgo | `https://ghgo.xyz` | 备选 |

### 降级策略

使用镜像加速源时，如果下载失败，自动降级到 GitHub 直连重试。

## 常见问题

### Q: 镜像加速源不可用怎么办？

系统会自动降级到 GitHub 直连。也可以在设置中手动切换到 GitHub 源。

### Q: 如何禁用自动发布？

删除 `.github/workflows/release.yml` 文件即可禁用自动发布。

### Q: 后续想换用 Cloudflare R2 或阿里云 OSS 可以吗？

可以，代码架构已预留扩展空间。只需新增一个 Provider（如 R2Provider），修改 feedURL 指向新的存储服务即可，其他逻辑无需改动。

## 相关文档

- [Release Workflow 使用指南](./release-workflow.md)
- [electron-updater 文档](https://www.electron.build/auto-update)
- [electron-builder publish 配置](https://www.electron.build/configuration/publish)
