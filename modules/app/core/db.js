const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
const { customAlphabet } = require('nanoid-cjs');
const nanoid = customAlphabet('1234567890abcdef', 10);

const DateFormat = require('@modules/utils/DateFormat');
const { getAppDataPath } = require('@modules/canbox/main/pathManager');

// 数据库连接缓存，记录连接和最后使用时间
const dbCache = {};

// 定时清理间隔（30分钟）
const CLEANUP_INTERVAL = 30 * 60 * 1000;

// 初始化定时清理任务
setInterval(() => {
    const now = Date.now();
    Object.entries(dbCache).forEach(([appId, { db, lastUsed }]) => {
        if (now - lastUsed > CLEANUP_INTERVAL) {
            db.close();
            delete dbCache[appId];
        }
    });
}, CLEANUP_INTERVAL);

// 获取或创建数据库连接
function getDB(appId) {
    if (!dbCache[appId]) {
        const dbDir = path.join(getAppDataPath(), appId);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        dbCache[appId] = {
            db: new PouchDB(path.join(dbDir, 'db'), { auto_compaction: true }),
            lastUsed: Date.now()
        };
    } else {
        dbCache[appId].lastUsed = Date.now();
    }
    return dbCache[appId].db;
}

// 内部方法：关闭所有数据库连接
function closeAllDBs() {
    Object.values(dbCache).forEach(({ db }) => db.close());
    dbCache = {};
}

// 生成文档 ID 和时间戳
function prepareDoc(doc) {
    doc._id = doc._id || nanoid();
    if (doc._rev) {
        doc.updateTime = doc.updateTime || DateFormat.format(new Date());
    } else {
        doc.createTime = doc.createTime || DateFormat.format(new Date());
    }
    return doc;
}

module.exports = {
    put: (appId, param, callback) => {
        const db = getDB(appId);
        const doc = prepareDoc(param);
        db.put(doc)
            .then(res => callback(res))
            .catch(err => callback(null, err));
    },
    bulkDocs: (appId, docs, callback) => {
        const db = getDB(appId);
        const preparedDocs = docs.map(prepareDoc);
        db.bulkDocs(preparedDocs)
            .then(res => callback(res))
            .catch(err => callback(null, err));
    },
    get: (appId, param, callback) => {
        const db = getDB(appId);
        db.get(param._id)
            .then(res => callback(res))
            .catch(err => callback(null, err));
    },
    find: (appId, query, callback) => {
        const db = getDB(appId);
        db.find(query)
            .then(res => callback(res))
            .catch(err => callback(null, err));
    },
    remove: (appId, param, callback) => {
        const db = getDB(appId);
        db.remove(param._id, param._rev)
            .then(res => callback(res))
            .catch(err => callback(null, err));
    },
    createIndex: (appId, index, callback) => {
        const db = getDB(appId);
        db.createIndex(index)
            .then(res => callback(res))
            .catch(err => callback(null, err));
    },
    allDocs: (appId, options, callback) => {
        const db = getDB(appId);
        db.allDocs(options)
            .then(res => callback(res))
            .catch(err => callback(null, err));
    },
    closeDB: (appId) => {
        if (dbCache[appId]) {
            dbCache[appId].db.close();
            delete dbCache[appId];
        }
    }
};