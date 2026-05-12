# Release Workflow 使用指南

## 触发方式

### 方式一：推送 Tag（自动构建所有平台）

```bash
git tag v0.4.0
git push origin v0.4.0
```

自动触发 GitHub Actions，构建所有平台（Linux）。

---

### 方式二：手动触发（可选择平台）

不需要推送任何东西，直接在 GitHub 网页操作：

1. 进入仓库 → **Actions** 标签
2. 左侧选择 **Release** workflow
3. 点击右侧 **"Run workflow"** 按钮
4. 弹出框选择构建平台：

   | 选项 | 说明 |
   |------|------|
   | `all` | 构建所有平台（默认） |
   | `linux` | 仅构建 Linux AppImage |
   | `windows` | 仅构建 Windows exe |
   | `darwin` | 仅构建 macOS dmg |

5. 点击绿色 **"Run workflow"**

---

## 平台选择场景

| 场景 | 推荐方式 |
|------|----------|
| 正式发布（多平台） | 推送 tag，自动构建 |
| 仅修复 Windows bug | 手动触发，选择 `windows` |
| 仅修复 Linux bug | 手动触发，选择 `linux` |
| 测试构建 | 手动触发，选择对应平台 |

---

## 构建产物

### Linux (AppImage)

| 文件 | 说明 |
|------|------|
| `*.AppImage` | Linux 安装包 |
| `*-delta*.AppImage` | 增量更新包 |
| `latest-linux.yml` | 更新信息文件 |

### 平台判断

当前 workflow 仅配置了 Linux 构建。如需多平台构建，需在 workflow 中添加对应步骤：

```yaml
- name: Build Windows
  if: github.event.inputs.platforms == 'all' || github.event.inputs.platforms == 'windows'
  run: npm run build-exe
```
