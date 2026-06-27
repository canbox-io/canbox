# Canbox

[中文版](README_zh-CN.md) | [English](README.md)

![Logo](logo_128x128.png)

**Canbox** 是一个轻量级应用运行时（runtime）平台，提供了最基础的功能能力，让开发者可以专注于应用本身的逻辑实现。

**Canbox** 是一个 app 集合平台，在这里我们可以开发自己的小工具，并且分享给他人使用。

**Canbox** 没有服务器，可以：

1. 通过 GitHub 等进行 APP 分享
2. 导入 APP 开发者打包好的程序包
3. 开发自己的 APP，打包分享给别人

---

## 🚧 项目状态

**Canbox 目前还处于早期开发阶段，许多功能还不够完善和成熟。**

作为一位非专业出身的开发者，我凭借自学完成了 Canbox 的初版代码，但深知自己的技术能力有限。因此，我非常欢迎和期待：

- ✅ 有经验的开发者提交 Pull Request 来改进代码
- ✅ 大家一起完善功能和修复 Bug
- ✅ 分享开发经验和最佳实践
- ✅ 提出建设性的 Issue 和建议

Canbox 是一个开放的项目，你的每一个贡献都能让它变得更好！

---

# 功能特性

- **应用管理**：支持应用的安装、卸载和更新。
- **快捷方式**：为常用应用创建快捷方式。
- **创建网页应用**：将任意网址封装为桌面应用，自动抓取网站信息，支持导航控制和别名系统。
- **多系统支持**：基于Electron，支持linux、windows（未测试完全）、mac（我没有mac😢，这个等有mac的人来干😆）
- **APP导入导出**：支持导入离线应用包，支持导出已安装应用供分享。
- **自动更新**：支持 GitHub 自动更新，可配置检查频率。
- **个性化配置**：可配置语言、字体、数据路径，支持窗口缩放（0.5x ~ 2.0x）。
- **日志查看器**：内置日志查看器，支持实时监控、过滤、搜索和导出功能。
- **文件任务管理**：统一下载、导入、导出等文件操作的任务管理。

# Canbox 使用

## 我的 APP

![MyApps](./public/screenshot/MyApps.png)

![MyApps-CreateWebApp](./public/screenshot/MyApps-CreateWebApp.png)

### 导入已有 APP

Canbox 支持导入开发者打包好的应用包（ZIP 格式）。

此功能特别适用于不适合公开分享的场景，例如：

- 企业内部工具，不适合对外公开
- 包含敏感业务逻辑或核心算法的应用
- 涉及私有数据处理要求的个人工具
- 临时或实验性应用，尚未准备好公开发布
- 面向特定组织或团队的定制化应用

### 导入步骤

1. 在"我的APP"页面点击"导入 APP"按钮
2. 选择开发者提供的 ZIP 文件
3. 系统会自动解压并安装应用

**导入文件要求**：

- 文件类型：ZIP（.zip）
- 内容：包含 asar 文件和必要的应用文件
- 文件命名：建议使用 `{app-id}-{version}.zip` 格式

导入完成后，应用会出现在"我的APP"列表中，可以直接使用。

### 数据管理

- **清除应用数据**：在"我的APP"中可以清除特定应用的运行数据
- **数据存储位置**：应用数据存储在系统用户数据目录下

## APP 仓库

![AppRepos](./public/screenshot/AppRepos.png)

![AddAppSource](./public/screenshot/AddAppSource.png)

### 添加 APP 源

在"APP仓库"-"添加APP源"里填入下面的Repo URL，即可添加APP源。

| App     | Repo URL                               | Description                                   |
| ------- | -------------------------------------- | --------------------------------------------- |
| JsonBox | https://github.com/rexlevin/cb-jsonbox | JSON 格式化、JSON 转换其他格式， 如 xml、yaml |
| PassGen | https://github.com/rexlevin/cb-passgen | 生成密码、随机串、时间戳                      |

更多 APP 请访问：[Canbox APP 中心](https://canbox-io.github.io/canbox-pages/apps.html)

### 导出 APP 源列表

1. 在"APP仓库"页面点击"导出 APP 源列表"按钮
2. 选择保存位置和文件名（JSON 格式）
3. 导出的文件包含当前所有仓库的完整信息

### 导入 APP 源列表

1. 在"APP仓库"页面点击"导入 APP 源列表"按钮
2. 选择之前导出的 JSON 文件
3. 系统会自动解析并添加仓库

**导入文件格式要求**：

- 文件类型：JSON（.json）
- 格式：仓库数组
- 必需字段：`repo`（仓库 URL）
- 其他字段会被忽略

**示例文件内容**：

```json
[
    {
        "repo": "https://github.com/user/repo1"
    },
    {
        "repo": "https://github.com/user/repo2"
    }
]
```

## APP开发

![AppDev](./public/screenshot/AppDev.png)

Canbox 作为轻量级 runtime，提供了最小化的基础功能集，让 APP 自由实现各类业务逻辑。

### Runtime 提供的基础能力

Canbox 为 APP 提供以下核心功能：

**数据持久化**

- `canbox.db` - 基于 PouchDB 的本地数据库（put/get/bulkDocs/remove）
- `canbox.store` - 基于 electron-store 的键值存储

**系统交互**

- `canbox.dialog` - 原生文件对话框（打开/保存/消息）
- `canbox.win.createWindow` - 创建子窗口
- `canbox.win.notification` - 系统通知

**生命周期**

- `registerCloseCallback` - 窗口关闭回调

**设计原则**

- 保持最小化，仅提供核心能力
- 其他功能由 APP 自行实现（如网络请求、剪贴板操作等）
- 保证 APP 有足够的自由度

### 开发流程

1. **创建开发项目**

   - 在"APP开发"页面点击"选择 app.json 新建 app 项目"
   - 选择包含 app.json 配置文件的目录
   - app.json 必须包含以下字段：
     - `id`：应用唯一标识
     - `name`：应用名称
     - `version`：应用版本
     - `description`：应用描述
     - `author`：作者信息
     - `logo`：应用图标路径（相对于 app.json）
2. **调试应用**

   - 点击运行图标即可在开发环境中测试应用
   - 可以随时修改代码并重新运行
   - 支持清除应用数据以便重新测试
3. **打包应用**

   - 点击打包图标将应用打包为 asar 文件
   - 自动生成 ZIP 包供分享
   - 打包产物位于项目的 `dist` 目录下

### 打包配置

在项目根目录创建 `cb.build.json` 配置文件：

```json
{
  "outputDir": "dist",
  "files": [
    "app.json",
    "README.md",
    "HISTORY.md",
    "build/**/*",
    "src/**/*"
  ]
}
```

配置说明：

- `outputDir`：打包输出目录
- `files`：需要打包的文件模式（支持 glob 语法）

详细的开发指南请参考：

- [Canbox 开发文档](./docs/development/CANBOX_DEV_CN.md)
- [APP 开发文档](./docs/development/APP_DEV_CN.md)
- [API 文档](./docs/development/API_CN.md)

## 设置

![Settings](./public/screenshot/Settings.png)

![Settings2](./public/screenshot/Settings2.png)

Canbox 提供了丰富的设置选项，帮助您个性化配置应用。

### 通用设置

- **语言**：选择应用语言（中文、英文）
- **字体**：选择应用字体（支持默认字体和多种系统字体）
- **APP启动模式**：选择窗口模式或子进程模式
- **创建/删除快捷方式**：为 Canbox 创建桌面快捷方式

### 数据管理

- **自定义数据路径**：设置 Canbox 所有数据的自定义目录
  - 查看当前数据路径和磁盘占用
  - 迁移到新路径（需要重启）
  - 重置为默认路径（需要重启）

### 日志查看器设置

- **日志保留天数**：配置日志文件保留天数（0-30 天，默认 30 天）
  - 设置为 0 表示禁用自动清理
  - 打开日志查看器时会自动清理旧日志

### 自动更新

- **启用自动更新**：应用启动时自动检查新版本
- **检查频率**：选择检查更新的频率（启动时、每天、每周或手动）
- **手动检查**：点击"立即检查更新"按钮手动触发版本检查
- **跳过版本**：查看和清除之前跳过的版本

### 日志查看器

从系统托盘菜单或使用快捷键打开日志查看器。功能包括：

- **实时监控**：实时查看日志，支持自动滚动
- **日志过滤**：按日志级别过滤（debug、info、warn、error）
- **搜索功能**：支持关键词搜索和正则表达式搜索
- **日志导出**：支持导出为 .txt 或 .json 格式
- **日期导航**：按日期查看历史日志
- **日志管理**：清空当日日志或清理历史日志文件
- **多日志源**：支持切换应用日志和监控日志
- **置顶显示**：保持日志查看器窗口置顶

![LogViewer.png](./public/screenshot/LogViewer.png)

### 快捷方式

Canbox 支持为常用应用创建快捷方式：

- 桌面快捷方式（Windows、Linux）
- 启动菜单快捷方式（Windows）
- 应用菜单快捷方式（macOS）

快捷方式会自动与应用同步，删除应用时会自动清理对应的快捷方式。

## 关于

![About](./public/screenshot/About.png)

查看 Canbox 版本信息、官方链接和开源致谢。

- **版本信息**：当前 Canbox 版本号
- **官方链接**：GitHub 仓库、官方网站
- **开源协议**：Apache 2.0 开源许可证
- **致谢**：感谢所有开源项目和贡献者

# 安装

## 下载安装

Canbox 提供以下格式供下载安装：

- **Linux**: AppImage 格式（推荐）- 适用于大多数 Linux 发行版
- **Windows**: 安装包格式
- **macOS**: 待支持

请访问项目的 GitHub Releases 页面下载最新版本的 Canbox。

# 欢迎提交 Issue！

# 许可证

Apache 2.0
