[中文版](CANBOX_DEV_CN.md) | [English](CANBOX_DEV.md)

# Canbox Development

1. Fork the code
2. Submit changes
3. Submit pull request
4. Wait for merge 😁

## Project Structure

```
canbox/
├── dist/                  # Build output directory
├── modules/               # Core modules
├── public/                # Static resources
├── src/                   # Frontend source code
├── main.js                # Main process entry
├── ipcHandlers.js         # IPC communication handlers
└── package.json           # Project configuration
```

## Debugging

- Start development server:
  ```bash
  npm run dev
  ```
- Debug main process:
  ```bash
  npm run start
  ```

## Build and Package

```bash
# 1 Clone the project
git clone https://github.com/rexlevin/canbox.git

# 2 Install dependencies
npm install

# 3 Vite build
npm run build

# 4 Package
npm run build-dist:linux  # Linux packages need Linux environment
npm run build-dist:win    # Windows packages need Windows environment, tested on Windows 11
```

## Canbox API Tips

1. Install `typescript`: `npm i -D typescript`
2. Create a `types` directory in the project root and place `canbox.d.ts` in the `types` directory
3. Create a `tsconfig.json` or `jsconfig.json` file in the project root

Example tsconfig.json content:

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

If your project uses `javascript`, the tsconfig.json content is as follows:

```json
{
    "compilerOptions": {
        "allowJs": true,
        "checkJs": false,
        "noEmit": true,   // Only type checking, no output file generation (JS projects don't need compilation)
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

Or you can use the `jsconfig.json` file with the following example content:

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

# Repos

Canbox has no central server. All available apps are spread by communication 😆

The repos file is a collection of app information, a JSON format description file:

```json
{
    "title": "",
    "version": "",
    "repos": [
        {
            "app": "",
            "description": "",
            "history": "",
            "release": ""
        }
    ]
}
```

# electron-store

Here is a list of all data saved using electron-store in canbox

You can find them in the electron userData directory: `app.getPath('userData'), 'Users')`

## canbox.json

Stores global settings for Canbox, including language, font, and window configuration.

```json
{
    "version": "0.1.4",
    "language": "zh-CN",
    "font": "\"Microsoft YaHei\", sans-serif",
    "windowBounds": {
        "x": 100,
        "y": 100,
        "width": 700,
        "height": 550
    },
    "isMaximized": false
}
```

**Field Descriptions**:

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Canbox version number |
| `language` | string | Interface language, such as "zh-CN", "en-US" |
| `font` | string | Global font, CSS font family string |
| `windowBounds` | object | Window position and size (automatically managed) |
| `windowBounds.x` | number | Window top-left x coordinate (screen coordinates) |
| `windowBounds.y` | number | Window top-left y coordinate (screen coordinates) |
| `windowBounds.width` | number | Window width (pixels) |
| `windowBounds.height` | number | Window height (pixels) |
| `isMaximized` | boolean | Whether the window is maximized (automatically managed) |

**Note**: `windowBounds` and `isMaximized` are automatically managed by the app and should not be manually modified.

- **Window state save timing**:
  - When user clicks the close button (minimize to tray)
  - When app exits

- **Window state restore rules**:
  - If `isMaximized` is `true`, maximize window on startup
  - If `isMaximized` is `false`, restore position and size from `windowBounds`
  - If saved position is invalid (e.g., screen resolution changed), automatically use default values (screen centered, 700x550)

| Field | Type | Meaning |
|-------|------|---------|
| language | string | Interface language, supports `zh-CN` (Simplified Chinese) and `en-US` (English) |
| font | string | Global font setting, CSS `font-family` property value, default is empty string (browser default) |

**Default Values**:
- `language`: Automatically detected based on system language, `zh-CN` for Chinese systems, `en-US` for others
- `font`: `default`, using browser default font

**Usage**:

```javascript
// Main process (ipcHandlers.js)
const { getCanboxStore } = require('./modules/main/storageManager');
const canboxStore = getCanboxStore();

// Read
const language = canboxStore.get('language', 'en-US');
const font = canboxStore.get('font', 'default');

// Save
canboxStore.set('language', 'zh-CN');
canboxStore.set('font', '"Microsoft YaHei", sans-serif');
```

```javascript
// Renderer process (via IPC)
// Read
const font = await window.api.font.get();

// Save
await window.api.font.set('"Microsoft YaHei", sans-serif');
```

## apps.json

```json
{
    "default": {
        "3a6f487d7f9f4fae86dcfbc3dde401a2": {
            "id": "com.gitee.lizl6.cb-jsonbox",
            "name": "jsonbox",
            "version": "0.0.1",
            "description": "JsonBox - Cross-platform JSON formatting tool",
            "author": "lizl6",
            "logo": "logo.png"
        },
        "885f615f9c374c96a022294950fed558": {
            "id": "com.gitee.lizl6.cb-passgen",
            "name": "passgen",
            "version": "0.0.2",
            "description": "PassGen - Password generator",
            "author": "lizl6",
            "logo": "logo.png",
            "sourceTag": "import",
            "importTime": "2025-09-02 10:28:12"
        }
    }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| uid | object | Unique app identifier, generated by canbox, used to distinguish different apps |
| id | string | App id, format: com.github.username.appname |
| name | | App name |
| version | | App version |
| description | | App description |
| author | | App author |
| logo | | App logo |
| sourceTag | | App source tag, used to distinguish app source: `import`, `git` |

## appsDev.json

```json
{
    "default": [
        {
            "id": "d80c120e35ec4216a7428241b9ac294a",
            "path": "/depot/cargo/cb-jsonbox/",
            "name": "jsonbox"
        },
        {
            "id": "f2dff38866914ad0a81c49504f5da266",
            "path": "/depot/cargo/canbox-demo/",
            "name": "demo"
        }
    ]
}
```

## repos.json

```json
{
    "default": {
        "3a6f487d7f9f4fae86dcfbc3dde401a2": {
            "id": "com.gitee.lizl6.cb-jsonbox",
            "name": "jsonbox",
            "repo": "https://gitee.com/rexlevin/cb-jsonbox",
            "branch": "master",
            "author": "lizl6",
            "version": "0.0.2",
            "description": "JsonBox - Cross-platform JSON formatting tool",
            "logo": "/home/lizl6/.config/canbox/Users/repos/3a6f487d7f9f4fae86dcfbc3dde401a2/logo.png",
            "files": {
                "app": {
                    "json": "39f57b38922a67772fc8b1535b3f3a678f95854f7e5b0791fde9caab8009be8a"
                },
                "README": {
                    "md": "b98eaa8cdea3f6325a13764d259c80cb4996a7bc0adaab228dbd68d2e275c51d"
                },
                "HISTORY": {
                    "md": "a3c15b800afcc01ff4d9b8e8bc700957b84cea81"
                }
            },
            "createTime": "2025-08-09 11:31:50",
            "downloaded": true,
            "downloadedTime": "2025-08-29 14:12:33",
            "toUpdate": true
        }
    }
}
```

| Field | Meaning |
|-------|---------|
| id | Unique repository identifier, composed of repository author and repository name |
| name | Repository name |
| repo | Repository address, a git repository URL, must ensure the repository is accessible |
| branch | Repository branch, default is main |
| author | Repository author |
| version | Repository version |
| description | Repository description |
| logo | Repository logo |
| files | Repository files |
| createTime | Repository creation time, yyyy-MM-dd HH:mm:ss |
| downloaded | `boolean`, whether downloaded |
| downloadedTime | Download time |
| toUpdate | `boolean`, whether update available |
