[中文版](APP_DEV_CN.md) | [English](APP_DEV.md)

# File Description

- `app.json`: APP description file, contains APP startup window parameters
- `uat.dev.json`: Development environment configuration, startup URL, open dev tools during development
- `README.md`: APP description, this file content will be displayed as APP information in canbox
- `HISTORY.md`: APP version history, this file content will be displayed as APP information in canbox
- `cb.build.json`: APP build configuration, specifies directories and files to include in the build, and the build output directory

# Canbox API Tips

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

# app.json

### Standard APP Example

```json
{
    "name": "Clipboard",
    "id": "com.github.dev001.clipboard",
    "description": "A useful clipboard tool",
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

### WebApp Example

WebApp is a special type of APP that wraps a webpage as a standalone desktop application. The `main` field points to an HTTP URL instead of a local file.

```json
{
    "id": "com.canbox.webapp.a1b2c3d4",
    "name": "YiYan",
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

### Field Descriptions

| Field | Parent | Type | Constraint | Description |
|-------|--------|------:|:----------:|-------------|
| id | | string | 1 | App application identifier<br>1. Multi-segment composition, such as: `com.gitee.dev001.clipboard`<br>2. Each segment consists of lowercase letters and numbers, starting with a lowercase letter<br>3. Only the last segment can use the `-` symbol |
| type | | string | * | APP type. `"webapp"` indicates a web application where `main` points to an HTTP URL. Omit or leave empty for standard local APPs |
| alias | | string | * | English alias for the APP name. Used in shortcut naming for non-ASCII named apps (e.g. Chinese names), making them searchable in launcher tools. Auto-extracted from URL domain for WebApps |
| webappOptions | | object | * | WebApp-specific options, only valid when `type` is `"webapp"` |
| webappOptions.showNavbar | webappOptions | boolean | * | Whether to show the navigation bar (back/forward/refresh). Default: `false` |
| window | | object | 1 | Same as BrowserWindow parameters in Electron |
| window.zoomEnabled | window | boolean | * | Enable zoom (Ctrl+Wheel / Ctrl++/-/0). Step: 0.1, range: 0.5~2.0, Ctrl+0 resets to 1.0. Default: `true` |
| platform | | array | * | windows, darwin, linux<br>Platforms supported by plugin apps, this is `optional`, **currently defaults to full platform support** |
| categories | | array | * | App category, at most the first two are taken |
| tags | | array | * | App tags, used for category display |

#### categories

| Key | Description |
|-----|-------------|
| education | Education app |
| office | Office |
| audio | Audio app |
| video | Video app |
| game | Game app |
| utility | Utility |
| development | Developer tools app |
| graphics | Graphics app |
| network | Network app |

# uat.dev.json

Development configuration

```json
{
    "main": "http://localhost:5173/",
    "devTools": "detach"
}
```

Field descriptions:

| Field | Parent | Type | Constraint | Description |
|-------|--------|------:|:----------:|-------------|
| main | development | string | ? | In development environment, `development.main` config will override `main` |
| devTools | development | string | ? | Open developer tools, left, right, bottom, undocked, detach |

# preload.js

Canbox has context isolation enabled. To use canbox provided APIs, you need to configure a preload script in app.json:

```json
"window": {
    "webPreferences": {
        "preload": "preload.js"
    }
}
```

Use canbox API in the preload script:

```javascript
# preload.js
canbox.hello();  # hello, hope you have a nice day
```

Preload follows the `CommonJS` specification, you can use `require` to import nodejs modules:

# External URLs

External URLs in APPs are automatically opened in the default browser without any extra handling. The behavior is as follows:

- `<a href="https://example.com">` clicks automatically open in the default browser
- `<a target="_blank" href="https://example.com">` also opens in the default browser
- Internal navigation (e.g., `file://` protocol, same-origin `http://localhost` jumps) is not affected and works normally within the window

### WebApp Link Behavior

When `app.json` has `type: "webapp"`, link handling differs from standard APPs:

| Link Type | Standard APP | WebApp |
|-----------|-------------|--------|
| Same-origin `target="_blank"` | Opens in default browser | **Opens within the window** |
| Cross-origin links | Opens in default browser | Opens in default browser |
| `file://` protocol | Opens within the window | N/A (WebApp has no local files) |

WebApp navigation also supports keyboard shortcuts: `Alt+←` (back), `Alt+→` (forward), `Ctrl+R`/`F5` (refresh), and a right-click context menu with navigation options.

If you need to actively open an external URL in JS code, use the `canbox.openUrl()` API:

```javascript
canbox.openUrl('https://example.com')
    .then(() => console.log('opened'))
    .catch(err => console.error('failed:', err));
```

If you need to open a URL within an Electron window (instead of the default browser), use the existing `canbox.win.createWindow()`:

```javascript
canbox.win.createWindow({}, { url: 'https://example.com', title: 'Docs' });
```

# Global Shortcut

**Supported platforms**: linux (x11)

Provides system-level global shortcut registration/unregistration capabilities. The shortcut mapping is persisted to `canbox.json` and automatically restored when Canbox restarts. APP developers only need to call `onTriggered()` to set up event listeners on each launch.

Two trigger modes:
- **`focus`** (default): Focus or launch the APP window when the shortcut is pressed. Suitable for quick-launch apps.
- **`callback`**: Send an IPC event to the APP renderer process. Suitable for tool-type apps (screenshot, voice input, etc.).

## canbox.shortcut.register(accelerator, options?)

Register a global shortcut.

- Parameters
  1. `string` accelerator - Electron accelerator string, e.g. `'Alt+Space'`, `'CommandOrControl+X'`
  2. `object` [options] - Optional configuration
     - `mode` `'focus' | 'callback'` - Trigger mode (default `'focus'`)
- Returns `Promise<object>`
  - `success: true` - Registration successful
  - `success: false` + `reason: 'occupied'` - Shortcut is occupied by another APP, `occupiedBy` contains the app name
  - `success: false` + `reason: 'system-occupied'` - Shortcut is occupied by the system or another application

```javascript
// Focus mode (default)
canbox.shortcut.register('Alt+Space', { mode: 'focus' })
    .then(result => {
        console.info('Registration result:', result);
    });

// Event callback mode
canbox.shortcut.register('Alt+X', { mode: 'callback' })
    .then(result => {
        console.info('Registration result:', result);
    });

// Conflict detection
canbox.shortcut.register('Alt+Space')
    .then(result => {
        if (!result.success && result.reason === 'occupied') {
            console.warn('Shortcut is occupied by: ' + result.occupiedBy);
        }
    });
```

**Note**: The shortcut mapping is persisted. After registering once, the shortcut will still work after Canbox restarts. You only need to set up the `onTriggered` listener each time the APP launches.

## canbox.shortcut.unregister(accelerator)

Unregister a global shortcut.

- Parameters
  1. `string` accelerator - Electron accelerator string
- Returns `Promise<object>`
  - `success: true` - Unregistration successful

```javascript
canbox.shortcut.unregister('Alt+Space')
    .then(result => {
        console.info('Shortcut unregistered:', result);
    });
```

## canbox.shortcut.isRegistered(accelerator)

Check if a shortcut is already registered.

- Parameters
  1. `string` accelerator - Electron accelerator string
- Returns `Promise<boolean>` - Whether the shortcut is registered

```javascript
canbox.shortcut.isRegistered('Alt+Space')
    .then(registered => {
        console.info('Is shortcut registered:', registered);
    });
```

## canbox.shortcut.onTriggered(callback)

Listen for shortcut trigger events (callback mode).

- Parameters
  1. `function` callback - Callback function when the shortcut is triggered, receives `accelerator` string as parameter

```javascript
// Register a shortcut in callback mode
canbox.shortcut.register('Alt+X', { mode: 'callback' })
    .then(() => {
        // Set up the event listener
        canbox.shortcut.onTriggered((accelerator) => {
            console.log('Shortcut triggered:', accelerator);
            // Execute custom logic, e.g. screenshot, voice input, etc.
        });
    });
```

**Note**: `onTriggered` should be called at APP startup to re-set the listener (callbacks are not persisted, only the accelerator → appId mapping is).

# cb.build.json

Canbox uses asar for packaging. Packaging is performed according to `cb.build.json` content:

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

Field descriptions:

| Field | Type | Description |
|-------|------|-------------|
| files | array | All file lists relative to cb.build.json |
| outputDir | string | A directory relative to cb.build.json. During packaging, this directory will be cleared, so don't place other needed files here |

# README.md

The README.md file at the same level as app.json will be parsed and displayed as app information in canbox

**Use network URLs for images to display correctly**

# HISTORY.md

Optional file, you can record your APP version history here.

Reverse chronological order is recommended.
