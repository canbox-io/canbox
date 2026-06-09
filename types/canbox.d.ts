// 定义 window.canbox 的类型
export {}; // 确保文件被识别为模块
declare global {
    interface Window {
        canbox: {
            /**
             * 钩子对象，用于存储全局状态
             */
            hooks: Record<string, any>;

            /**
             * 示例方法
             */
            hello: () => void;

            /**
             * 数据库操作模块
             * 基于 PouchDB，提供本地数据持久化能力
             */
            db: {
                /**
                 * 新增或更新文档
                 * @param param - 文档对象，必须包含 `_id` 字段
                 * @returns Promise<any> - 返回操作结果，成功时返回包含 id、ok、rev 的对象
                 */
                put: (param: { _id: string; [key: string]: any }) => Promise<any>;

                /**
                 * 批量操作文档，支持新增、修改和删除
                 * @param docs - 文档数组
                 * @returns Promise<Array<any>> - 返回操作结果数组
                 * 
                 * @description
                 * - 新增文档：当文档没有 `_id` 或没有 `_rev` 时，canbox 会自动生成 `_id` 并插入新文档
                 * - 修改文档：当文档包含 `_id` 和 `_rev` 时，会更新现有文档
                 * - 删除文档：当文档包含 `_deleted: true` 参数时，会删除该文档（需要提供 `_id` 和 `_rev`）
                 */
                bulkDocs: (docs: Array<{ _id?: string; _rev?: string; _deleted?: boolean; [key: string]: any }>) => Promise<Array<any>>;

                /**
                 * 获取单个文档
                 * @param param - 查询参数，必须包含 `_id` 字段
                 * @returns Promise<any> - 返回查询结果，成功时返回包含文档数据的对象
                 */
                get: (param: { _id: string }) => Promise<any>;

                /**
                 * 同步获取单个文档（非 Promise）
                 * @param param - 查询参数，必须包含 `_id` 字段
                 * @returns any | null - 返回查询结果，成功时返回文档数据，失败时返回 null
                 */
                getSync: (param: { _id: string }) => any | null;

                /**
                 * 获取所有文档
                 * @param options - 查询选项
                 * @param options.include_docs - 是否返回完整文档内容（默认 false）
                 * @param options.limit - 限制返回的文档数量
                 * @param options.descending - 是否倒序排列
                 * @param options.startkey - 开始的文档 ID（用于范围查询）
                 * @param options.endkey - 结束的文档 ID（用于范围查询）
                 * @param options.skip - 跳过的文档数量（用于分页）
                 * @returns Promise<any> - 返回查询结果，包含 total_rows、offset、rows
                 */
                allDocs: (options?: { include_docs?: boolean; limit?: number; descending?: boolean; startkey?: string; endkey?: string; skip?: number }) => Promise<any>;

                /**
                 * 使用 Mango 查询语法查询文档
                 * @param query - 查询条件对象
                 * @param query.selector - 查询选择器（支持 Mango 查询语法）
                 * @param query.sort - 排序规则，例如 [{ createTime: 'desc' }]
                 * @param query.limit - 限制返回的文档数量
                 * @param query.fields - 指定返回的字段（减少数据传输量）
                 * @returns Promise<any> - 返回查询结果，成功时返回包含 docs 数组的结果对象
                 */
                find: (query: { selector: any; sort?: any; limit?: number; fields?: string[] }) => Promise<any>;

                /**
                 * 创建索引以提升查询性能
                 * @param index - 索引配置对象
                 * @param index.index.fields - 索引字段数组，例如 ['type'] 或 ['type', 'active']
                 * @returns Promise<any> - 返回创建结果，成功时返回包含 result、id、name、ok 的对象
                 */
                createIndex: (index: { index: { fields: any } }) => Promise<any>;

                /**
                 * 删除文档
                 * @param param - 删除参数，必须包含 `_id` 和 `_rev` 字段
                 * @returns Promise<any> - 返回操作结果，成功时返回包含 id、ok、rev 的对象
                 */
                remove: (param: { _id: string; _rev: string }) => Promise<any>;
            };

            /**
             * 窗口操作模块
             */
            win: {
                /**
                 * 创建子窗口
                 * @param options - 窗口配置选项，参考 Electron BrowserWindowConstructorOptions
                 * @param params - 其他参数
                 * @param params.url - 窗口加载页面的相对路径或路由路径
                 * @param params.title - 窗口标题
                 * @param params.devTools - 是否开启开发者工具（默认 false）
                 * @param params.escClose - 是否按 ESC 关闭窗口（默认 false）
                 * @returns Promise<any> - 返回窗口 ID
                 */
                createWindow: (options: any, params?: { url?: string; title?: string; devTools?: boolean; escClose?: boolean }) => Promise<any>;

                /**
                 * 发送系统通知
                 * @param options - 通知配置选项
                 * @param options.title - 通知标题
                 * @param options.body - 通知内容
                 * @returns Promise<void>
                 */
                notification: (options: { title: string; body: string }) => Promise<void>;
            };

            /**
             * 提权执行模块
             * 提供跨平台的提权执行命令功能
             */
            sudo: {
                /**
                 * 执行需要提权的命令
                 * @param options - 提权选项
                 * @param options.command - 要执行的命令（必填）
                 * @param options.name - 操作名称，用于向用户提示为何需要提权（必填，支持中文等非 ASCII 字符）
                 * @returns Promise<{ stdout: string; stderr: string }> - 返回执行结果，包含 stdout 和 stderr
                 * 
                 * @description
                 * name 参数说明：
                 * - 支持中文等非 ASCII 字符，内部会自动净化为系统认证对话框可接受的格式
                 * - 建议使用有意义的描述，例如：'Apply Hosts Config'、'修改 hosts 文件'
                 */
                exec: (options: { command: string; name: string }) => Promise<{ stdout: string; stderr: string }>;
            };

            /**
             * 对话框模块
             * 直接封装 Electron 的 dialog 模块，请求参数和应答均可参见 Electron dialog 文档
             */
            dialog: {
                /**
                 * 打开文件选择对话框
                 * 与 Electron showOpenDialog 一致
                 * @param options - 对话框配置选项
                 * @returns Promise<any> - 返回文件选择结果
                 */
                showOpenDialog: (options: any) => Promise<any>;

                /**
                 * 打开文件保存对话框
                 * 与 Electron showSaveDialog 一致
                 * @param options - 对话框配置选项
                 * @returns Promise<any> - 返回保存路径结果
                 */
                showSaveDialog: (options: any) => Promise<any>;

                /**
                 * 打开消息对话框
                 * 与 Electron showMessageBox 一致
                 * @param options - 对话框配置选项
                 * @returns Promise<any> - 返回用户选择结果
                 */
                showMessageBox: (options: any) => Promise<any>;
            };

            /**
             * 本地存储模块
             * 使用 electron-store 进行数据存储，每个 name 对应一个独立的 .json 文件
             */
            store: {
                /**
                 * 获取存储的值
                 * @param name - 存储名称，对应不同的 .json 文件
                 * @param key - 存储的键
                 * @returns Promise<any> - 返回存储的值
                 */
                get: (name: string, key: string) => Promise<any>;

                /**
                 * 设置存储的值
                 * @param name - 存储名称，对应不同的 .json 文件
                 * @param key - 存储的键
                 * @param value - 存储的值
                 * @returns Promise<void>
                 */
                set: (name: string, key: string, value: any) => Promise<void>;

                /**
                 * 删除存储的值
                 * @param name - 存储名称，对应不同的 .json 文件
                 * @param key - 存储的键
                 * @returns Promise<void>
                 */
                delete: (name: string, key: string) => Promise<void>;

                /**
                 * 清空指定存储的所有数据
                 * @param name - 存储名称，对应不同的 .json 文件
                 * @returns Promise<void>
                 */
                clear: (name: string) => Promise<void>;
            };

            /**
             * 注册窗口关闭时的回调函数
             * @param callback - 窗口关闭时执行的回调函数
             */
            registerCloseCallback: (callback: () => void) => void;

            /**
             * 获取 canbox 当前语言设置
             * 支持 Window 模式和 Childprocess 模式
             * @returns string - 当前语言代码，如 'zh-CN' 或 'en-US'
             * @example
             * const locale = canbox.getLocale();
             * console.log(locale); // 'zh-CN'
             */
            getLocale: () => string;

            /**
             * 使用默认浏览器打开外部 URL
             * @param url - 要打开的 URL 地址
             * @returns Promise<void>
             * @example
             * canbox.openUrl('https://example.com')
             *   .then(() => console.log('opened'))
             *   .catch(err => console.error(err));
             */
            openUrl: (url: string) => Promise<void>;
        };
    }

    // 定义全局变量 canbox
    const canbox: Window['canbox'];
}
