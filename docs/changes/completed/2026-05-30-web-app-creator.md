# web-app-creator

## 概述

新增"创建网页应用"功能，用户输入网址后 Canbox 自动抓取网站名称和图标，用户可编辑确认后生成 WebApp 类型的 APP，像本地应用一样打开使用。

## 核心设计

### 整体流程

```
用户点击"创建网页应用" → 输入 URL → 回车/点击"获取" → 抓取网站信息 → 编辑确认 → 生成 asar 包 → 注册到 Canbox → 出现在"我的 APP"
```

### App ID 命名

格式：`com.canbox.webapp.{uuid前8位}`，例如 `com.canbox.webapp.a1b2c3d4`。规整且无版权风险。

### WebApp 的 app.json 结构

```json
{
    "id": "com.canbox.webapp.a1b2c3d4",
    "name": "百度一下",
    "alias": "baidu",
    "version": "1.0.0",
    "description": "Web App: https://www.baidu.com",
    "author": "",
    "logo": "logo.png",
    "main": "https://www.baidu.com",
    "type": "webapp",
    "webappOptions": {
        "showNavbar": false
    },
    "window": {
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
    }
}
```

- `type: "webapp"` 标识这是网页应用，用于导航行为差异化
- `alias` 英文别名，解决中文应用名在快速启动工具中不便搜索的问题
- `webappOptions.showNavbar` 控制是否显示导航栏，默认 false（沉浸式）
- `main` 直接填入 http URL，现有加载逻辑已支持
- asar 包内仅包含 `app.json` + `logo.png`

### 网站信息抓取策略（website-scraper.js）

1. **HTTP 请求优先**：请求 URL → 解析 HTML → 提取 `<title>`、`<link rel="icon">`、`<link rel="apple-touch-icon">`
2. **BrowserWindow fallback**：创建隐藏窗口加载页面 → `did-finish-load` 后从渲染后的 DOM 提取 title 和 favicon
3. **图标下载**：获取到图标 URL 后下载为 PNG，若为 ICO 格式则直接保存
4. **默认兜底**：抓取失败时使用 `modules/web-app/default-icon.png`

### 导航处理（web-app-navigator.js）

**核心原则：不影响已有功能。** 通过 `appJson.type === 'webapp'` 判断，只在 webapp 模式下启用差异化行为。

#### 链接处理对比

| 行为 | 普通APP | WebApp |
|------|---------|--------|
| 同源导航 | 正常放行 | 正常放行 |
| 跨域导航 | 外部浏览器 | 外部浏览器 |
| 同源 `target="_blank"` | 外部浏览器 | **窗口内打开** |
| 跨域 `target="_blank"` | 外部浏览器 | 外部浏览器 |

#### 快捷键（仅 WebApp）

- `Alt+←` 后退
- `Alt+→` 前进
- `Ctrl+R` / `F5` 刷新

#### 右键菜单（仅 WebApp）

新增：后退 / 前进 / 刷新 / 在浏览器中打开

### alias（英文别名）系统

为解决中文应用名在快速启动工具中不便搜索的问题：
- 中文名应用自动从 URL 域名提取英文别名（如 `yiyan.baidu.com` → `yiyan`）
- 快捷方式命名为 `canbox-中文名 (英文别名)` 格式
- 英文名应用不添加别名后缀

### 前端对话框交互（CreateWebAppDialog.vue）

- 660px 宽弹层，22px 标题
- 说明文字 16px，首行缩进 2em
- 无 el-form，手动校验，避免自动校验 warning
- URL 输入框支持回车键触发"获取"
- 名称 + 别名并排，图标 + 导航开关各占一行
- 整体字体 16px 统一中英文环境

## 实际修改/新增文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `modules/web-app/website-scraper.js` | 网站元数据抓取 |
| 新增 | `modules/web-app/web-app-navigator.js` | 导航处理逻辑 |
| 新增 | `modules/web-app/web-app-creator.js` | asar 包生成 + APP 注册 |
| 新增 | `modules/web-app/default-icon.png` | WebApp 默认图标 |
| 新增 | `src/components/CreateWebAppDialog.vue` | 前端对话框 |
| 修改 | `modules/ipc/appManagerIpcHandler.js` | 新增 IPC handler（fetch-website-info、create-web-app、get-default-icon-path） |
| 修改 | `preload.js` | 新增 webApp 命名空间 |
| 修改 | `src/components/AppList.vue` | 新增"创建网页应用"按钮 |
| 修改 | `modules/core/win.js` | setupExternalUrlHandler 增加 isWebApp 参数 |
| 修改 | `childprocessEntry.js` | setupExternalUrlHandler 增加 isWebApp 参数 |
| 修改 | `modules/integrated/appWindowManager.js` | 调用 setupExternalUrlHandler 时传入 isWebApp，加载 web-app-navigator |
| 修改 | `modules/main/appManager.js` | getAppInfo 中 WebApp 跳过 README/HISTORY 检查 |
| 修改 | `modules/main/shortcutManager.js` | 快捷方式命名支持 alias |
| 修改 | `locales/zh-CN.json` | 新增国际化文案 |
| 修改 | `locales/en-US.json` | 新增国际化文案 |

## 实施计划

- [x] 创建 `modules/web-app/website-scraper.js`：网站元数据抓取
- [x] 创建 `modules/web-app/web-app-navigator.js`：导航处理逻辑
- [x] 创建 `modules/web-app/web-app-creator.js`：asar 包生成 + APP 注册
- [x] 修改 `modules/ipc/appManagerIpcHandler.js`：新增 IPC handler
- [x] 修改 `preload.js`：新增 webApp 命名空间
- [x] 创建 `src/components/CreateWebAppDialog.vue`：前端对话框
- [x] 修改 `src/components/AppList.vue`：新增"创建网页应用"按钮
- [x] 修改 `modules/core/win.js`：setupExternalUrlHandler 增加 isWebApp 参数
- [x] 修改 `childprocessEntry.js`：setupExternalUrlHandler 增加 isWebApp 参数
- [x] 修改 `modules/integrated/appWindowManager.js`：调用 setupExternalUrlHandler 时传入 isWebApp
- [x] 更新 `locales/zh-CN.json` 和 `locales/en-US.json`：新增国际化文案
- [x] 构建验证 + 功能测试
