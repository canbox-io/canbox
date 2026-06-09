const path = require('path');
const fs = require('fs');
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
const { customAlphabet } = require('nanoid-cjs');
const nanoid = customAlphabet('1234567890abcdef', 10);

const DateFormat = require('@modules/utils/DateFormat');
const PathManager = require('@modules/canbox/main/pathManager');

// 默认配置
const DEFAULT_CONFIG = {
    maxDays: 30,      // 默认保留天数
    maxSize: 200,     // 默认最大大小（MB）
    maxRecords: 10000 // 最大记录数上限
};

let db = null;

/**
 * 获取数据库实例（单例）
 * @returns {PouchDB} 数据库实例
 */
function getDB() {
    if (!db) {
        const dbDir = PathManager.getHistoryDbPath();
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        db = new PouchDB(path.join(dbDir, 'db'), { auto_compaction: true });
    }
    return db;
}

/**
 * 生成文档 ID
 * @param {string} prefix - ID 前缀
 * @returns {string} 生成的 ID
 */
function generateId(prefix = 'op') {
    return `${prefix}_${nanoid()}`;
}

/**
 * 准备文档，添加 ID 和时间戳
 * @param {object} doc - 文档对象
 * @returns {object} 处理后的文档
 */
function prepareDoc(doc) {
    doc._id = doc._id || generateId();
    if (doc._rev) {
        doc.updateTime = doc.updateTime || DateFormat.format(new Date());
    } else {
        doc.createTime = doc.createTime || DateFormat.format(new Date());
    }
    return doc;
}

/**
 * 关闭数据库连接
 */
function closeDB() {
    if (db) {
        db.close();
        db = null;
    }
}

/**
 * 获取数据库存储大小
 * @param {function} callback - 回调函数 (sizeInMB, error)
 */
function getSize(callback) {
    try {
        const dbDir = PathManager.getHistoryDbPath();
        const dbPath = path.join(dbDir, 'db');

        // PouchDB 的 LevelDB 存储，需要计算 .couch 文件大小
        let totalSize = 0;

        function calculateDirSize(dir) {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    calculateDirSize(filePath);
                } else {
                    totalSize += stat.size;
                }
            });
        }

        calculateDirSize(dbPath);
        const sizeInMB = totalSize / (1024 * 1024);
        callback(sizeInMB, null);
    } catch (error) {
        callback(0, error);
    }
}

module.exports = {
    /**
     * 插入记录
     * @param {object} param - 记录参数
     * @param {string} [param.type] - 类型：success/error/info/warning
     * @param {string} param.message - 消息内容
     * @param {string} [param.module] - 来源模块
     * @param {object} [param.details] - 额外详情
     * @param {function} callback - 回调函数 (result, error)
     */
    put: (param, callback) => {
        const dbInstance = getDB();
        const doc = prepareDoc({
            type: param.type || 'info',
            message: param.message || '',
            module: param.module || 'unknown',
            details: param.details || {},
            params: param.params || {},
            timestamp: Date.now()
        });
        dbInstance.put(doc)
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    /**
     * 根据 ID 获取记录
     * @param {object} param - 查询参数
     * @param {string} param._id - 记录 ID
     * @param {function} callback - 回调函数 (result, error)
     */
    get: (param, callback) => {
        const dbInstance = getDB();
        dbInstance.get(param._id)
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    /**
     * 查询记录
     * @param {object} query - 查询条件
     * @param {function} callback - 回调函数 (result, error)
     */
    find: (query, callback) => {
        const dbInstance = getDB();
        dbInstance.find(query)
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    /**
     * 删除记录
     * @param {object} param - 删除参数
     * @param {string} param._id - 记录 ID
     * @param {string} [param._rev] - 记录版本
     * @param {function} callback - 回调函数 (result, error)
     */
    remove: (param, callback) => {
        const dbInstance = getDB();
        dbInstance.remove(param._id, param._rev)
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    /**
     * 批量删除记录
     * @param {array} docs - 要删除的文档数组
     * @param {function} callback - 回调函数 (result, error)
     */
    bulkRemove: (docs, callback) => {
        const dbInstance = getDB();
        dbInstance.bulkDocs(docs.map(doc => ({
            ...doc,
            _deleted: true
        })))
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    /**
     * 获取所有记录（按时间倒序）
     * @param {object} [options] - 查询选项
     * @param {number} [options.limit] - 限制返回数量
     * @param {function} callback - 回调函数 (result, error)
     */
    allDocs: (options, callback) => {
        const dbInstance = getDB();
        const queryOptions = {
            include_docs: true,
            descending: true,
            ...options
        };
        dbInstance.allDocs(queryOptions)
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    /**
     * 清理过期记录（按天数）
     * @param {number} [maxDays] - 最大保留天数
     * @param {function} callback - 回调函数 (deletedCount, error)
     */
    cleanupByDays: (maxDays, callback) => {
        const maxDaysNum = maxDays || DEFAULT_CONFIG.maxDays;
        const cutoffTime = Date.now() - maxDaysNum * 24 * 60 * 60 * 1000;

        const dbInstance = getDB();
        dbInstance.find({
            selector: {
                timestamp: { $lt: cutoffTime }
            },
            fields: ['_id', '_rev']
        })
            .then(res => {
                if (res.docs.length === 0) {
                    callback(0, null);
                    return;
                }
                return module.exports.bulkRemove(res.docs, (bulkResult, bulkError) => {
                    if (bulkError) {
                        callback(0, bulkError);
                    } else {
                        callback(res.docs.length, null);
                    }
                });
            })
            .catch(err => callback(0, err));
    },

    /**
     * 获取存储大小
     * @param {function} callback - 回调函数 (sizeInMB, error)
     */
    getSize,

    /**
     * 关闭数据库
     */
    closeDB,

    /**
     * 获取默认配置
     * @returns {object} 默认配置
     */
    getDefaultConfig: () => DEFAULT_CONFIG
};
