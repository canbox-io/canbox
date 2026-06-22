[中文版](APP_DEV_CN.md) | [English](APP_DEV.md)

# 文件说明

- `app.json`: APP描述文件，包含 APP 启动的窗口参数
- `uat.dev.json`: 开发环境配置，开发时的启动URL、打开开发工具
- `READMEmd`: APP 说明，这个文件内容会作为 APP 信息在 canbox 展示
- `HISTORY.md`: APP 版本历史，这个文件内容会作为 APP 信息在 canbox 展示
- `cb.build.json`: APP 打包配置，指名打包包含的目录、文件，已经打包结果输出目录

# CanBox API提示

1. 安装 `typescript` ： `npm i -D typescript`
2. 在项目根目录下创建目录  `types `，将 `canbox.d.ts `放到 `types` 目录中
3. 在项目根目录下创建 `tsconfig.json` 或 `jsconfig.json` 文件

tsconfig.json 文件内容示例如下：

```json
{
    "compilerOptions": {
        "target": "es6",
        "module": "commonjs",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "typeRoots": ["./types", "./node_modules/@types"]
    },
    "include": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    "exclude": ["node_modules"]
}
```

如果你的项目使用 `javascript`，`tsconfig.json` 文件内容如下：

```json
{
    "compilerOptions": {
        "allowJs": true,
        "checkJs": false,
        "noEmit": true,   // 仅进行类型检查，不生成输出文件（JS项目无需编译）
        "strict": false,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "maxNodeModuleJsDepth": 0,
        "target": "es6",
        "module": "commonjs",
        "forceConsistentCasingInFileNames": true,
        "typeRoots": ["./types", "./node_modules/@types"]
    },
    "include": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    "exclude": ["node_modules"]
}
```

或者是使用使用 `jsconfig.json` 文件示例内容如下：

```json
{
    "compilerOptions": {
        "checkJs": false,
        "strict": false,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "maxNodeModuleJsDepth": 0,
        "target": "es6",
        "module": "commonjs",
        "forceConsistentCasingInFileNames": true,
        "typeRoots": ["./types", "./node_modules/@types"]
    },
    "include": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    "exclude": ["node_modules"]
}
```

# app.json

### 普通 APP 示例

```json
{
    "name": "剪贴板",
    "id": "com.github.dev001.clipboard",
    "description": "一个好用的剪贴板",
    "author": "dev001",
    "repo": "https://github.com/dev001/clipboard",
    "homepage": "https://dev001.github.io",
    "main": "index.html",
    "logo": "logo.png",
    "version": "0.0.6",
    "window": {
        "minWidth": 800,
        "minHeight": 400,
        "width": 900,
        "height": 500,
        "icon": "logo.png",
        "resizable": false,
        "webPreferences": {
            "preload": "preload.js"
        }
    },
    "platform": ["windows", "darwin", "linux"],
    "categories": ["development", "utility"],
    "tags": ["json", "jsonformatter"]
}
```

### WebApp 示例

WebApp 是一种特殊类型的 APP，将网页封装为独立桌面应用。`main` 字段指向 HTTP URL 而非本地文件。

```json
{
    "id": "com.canbox.webapp.a1b2c3d4",
    "name": "文心一言",
    "alias": "yiyan",
    "version": "1.0.0",
    "description": "Web App: https://yiyan.baidu.com",
    "author": "",
    "logo": "logo.png",
    "main": "https://yiyan.baidu.com",
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

### 字段说明

| 字段 | 父节点 |  类型  | 约束 | 说明                                                                                                                                                    |
|------|--------|:------:|:----:|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| id | | string |  1  | app应用标识<br />1. 多段组成，如：`com.gitee.dev001.clipboard`<br />2. 每段都由小写字母和数字组成，且小写字母开头<br />3. 仅最后一段可以使用 - 符号 |
| type | | string |  *  | APP 类型。`"webapp"` 表示网页应用，`main` 指向 HTTP URL。普通本地 APP 省略或留空 |
| alias | | string |  *  | APP 名称的英文别名。用于非 ASCII 名称（如中文）的快捷方式命名，便于在启动器工具中搜索。WebApp 创建时自动从 URL 域名提取 |
| webappOptions | | object |  *  | WebApp 专属选项，仅当 `type` 为 `"webapp"` 时有效 |
| webappOptions.showNavbar | webappOptions | boolean |  *  | 是否显示导航栏（前进/后退/刷新）。默认：`false` |
| window | | object |  1  | 同 Electron 中 BrowserWindow 参数                                                                                                                       |
| window.zoomEnabled | window | boolean |  *  | 是否启用缩放（Ctrl+滚轮/Ctrl++/-/0）。步进 0.1，范围 0.5~2.0，Ctrl+0 重置到 1.0。默认：`true` |
| platform | | array |  *  | windows, darwin, linux<br />插件应用支持的平台，此为 `可选项`，**当前是默认为全平台支持**                                                       |
| categories | | array |  *  | app分类，最多只取前两个                                                                                                                                 |
| tags | | array |  *  | app标签，用于分类展示                                                                                                                                   |

#### categories

| key         | 说明          |
| ----------- | ------------- |
| education   | 教育app       |
| office      | 办公          |
| audio       | 音频app       |
| video       | 视频app       |
| game        | 游戏app       |
| utility     | 工具          |
| development | 开发者工具app |
| graphics    | 图形应用app   |
| network     | 网络应用程序  |

# uat.dev.json

开发配置

```json
{
    "main": "http://localhost:5173/",
    "devTools": "detach"
}
```

字段说明：

| 字段     | 父节点      |  类型  | 约束 | 说明                                                  |
| -------- | ----------- | :----: | :--: | ----------------------------------------------------- |
| main     | development | string |  ?  | 开发环境下 `development.main` 配置会覆盖 `main`   |
| devTools | development | string |  ?  | 打开开发者工具，left, right, bottom, undocked, detach |

# preload.js

canbox开启了上下文隔离，想要使用canbox提供的api，需要在 app.json 中配置预加载脚本：

```json
"window": {
    "webPreferences": {
        "preload": "preload.js"
    }
}
```

在预加载脚本中使用canbox的api：

```javascript
# preload.js
canbox.hello();  # hello, hope you have a nice day
```

preload遵循 `CommonJS` 规范，可以使用 `require` 来引入 nodejs 模块：

# 外部链接

APP 中的外部链接会自动使用默认浏览器打开，无需额外处理。具体行为：

- `<a href="https://example.com">` 点击后自动用默认浏览器打开
- `<a target="_blank" href="https://example.com">` 同样用默认浏览器打开
- APP 内部导航（如 `file://` 协议、同源 `http://localhost` 跳转）不受影响，正常在窗口内跳转

### WebApp 链接行为

当 `app.json` 中 `type` 为 `"webapp"` 时，链接处理与普通 APP 不同：

| 链接类型 | 普通 APP | WebApp |
|----------|---------|--------|
| 同源 `target="_blank"` | 默认浏览器打开 | **窗口内打开** |
| 跨域链接 | 默认浏览器打开 | 默认浏览器打开 |
| `file://` 协议 | 窗口内打开 | 不适用（WebApp 无本地文件） |

WebApp 导航还支持键盘快捷键：`Alt+←`（后退）、`Alt+→`（前进）、`Ctrl+R`/`F5`（刷新），以及右键菜单导航选项。

如果需要在 JS 代码中主动打开外部链接，可以使用 `canbox.openUrl()` API：

```javascript
canbox.openUrl('https://example.com')
    .then(() => console.log('已打开'))
    .catch(err => console.error('打开失败:', err));
```

如果需要在 Electron 窗口内打开 URL（而非默认浏览器），请使用已有的 `canbox.win.createWindow()`：

```javascript
canbox.win.createWindow({}, { url: 'https://example.com', title: '文档' });
```

# cb.build.json

canbox使用asar进行打包，打包依据 `cb.build.json` 内容进行：

```json
{
    "files": [
        "build/**/*",
        "preload.js",
        "logo.png",
        "app.json",
        "README.md"
    ],
    "outputDir": "./dist"
}
```

字段说明：

| 字段      | 类型   | 说明                                                                                      |
| --------- | ------ | ----------------------------------------------------------------------------------------- |
| files     | array  | 相对 cb.build.json 的所有文件列表                                                         |
| outputDir | string | 相对 cb.build.json 的一个目录，打包过程中这个目录会有清空操作，所以不要放置其他需要的文件 |

# README.md

和 app.json 同级的 README.md 文件将会被解析为 app 信息在 canbox 展示

**图片地址使用网络url才能正确展示**

# HISTORY.md

非必须文件，可以在这里记录下你的APP的版本历史。

推荐倒叙记录。
