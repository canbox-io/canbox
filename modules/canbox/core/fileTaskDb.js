const path = require('path');
const fs = require('fs');
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
const { customAlphabet } = require('nanoid-cjs');
const nanoid = customAlphabet('1234567890abcdef', 10);

const DateFormat = require('@modules/utils/DateFormat');
const PathManager = require('@modules/canbox/main/pathManager');

const DEFAULT_CONFIG = {
    maxDays: 30
};

let db = null;

function getDB() {
    if (!db) {
        const dbDir = PathManager.getFileTaskDbPath();
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        db = new PouchDB(path.join(dbDir, 'db'), { auto_compaction: true });
    }
    return db;
}

function generateId() {
    return `task_${nanoid()}`;
}

function prepareDoc(doc) {
    doc._id = doc._id || generateId();
    if (doc._rev) {
        doc.updateTime = doc.updateTime || DateFormat.format(new Date());
    } else {
        doc.createTime = doc.createTime || DateFormat.format(new Date());
    }
    return doc;
}

function closeDB() {
    if (db) {
        db.close();
        db = null;
    }
}

function toPersistTask(task) {
    return {
        taskId: task.id,
        type: task.type,
        uid: task.uid,
        status: task.status,
        progress: task.progress,
        progressText: task.progressText,
        error: task.error,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        options: task.options,
        timestamp: task.createdAt
    };
}

module.exports = {
    put: (task, callback) => {
        const dbInstance = getDB();
        const persistData = toPersistTask(task);

        dbInstance.find({
            selector: { taskId: task.id },
            limit: 1
        }).then(result => {
            if (result.docs.length > 0) {
                const existing = result.docs[0];
                const doc = prepareDoc({
                    ...existing,
                    ...persistData,
                    _id: existing._id,
                    _rev: existing._rev
                });
                return dbInstance.put(doc);
            } else {
                const doc = prepareDoc(persistData);
                return dbInstance.put(doc);
            }
        }).then(res => callback(res, null))
          .catch(err => callback(null, err));
    },

    get: (taskId, callback) => {
        const dbInstance = getDB();
        dbInstance.find({
            selector: { taskId: taskId },
            limit: 1
        }).then(result => {
            if (result.docs.length > 0) {
                callback(result.docs[0], null);
            } else {
                callback(null, { message: 'not found' });
            }
        }).catch(err => callback(null, err));
    },

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

    remove: (param, callback) => {
        const dbInstance = getDB();
        dbInstance.remove(param._id, param._rev)
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    bulkRemove: (docs, callback) => {
        const dbInstance = getDB();
        dbInstance.bulkDocs(docs.map(doc => ({
            ...doc,
            _deleted: true
        })))
            .then(res => callback(res, null))
            .catch(err => callback(null, err));
    },

    cleanupByDays: (maxDays, callback) => {
        const maxDaysNum = maxDays || DEFAULT_CONFIG.maxDays;
        const cutoffTime = Date.now() - maxDaysNum * 24 * 60 * 60 * 1000;

        const dbInstance = getDB();
        dbInstance.find({
            selector: {
                timestamp: { $lt: cutoffTime }
            },
            fields: ['_id', '_rev']
        }).then(result => {
            if (result.docs.length === 0) {
                callback(0, null);
                return;
            }
            return module.exports.bulkRemove(result.docs, (bulkResult, bulkError) => {
                if (bulkError) {
                    callback(0, bulkError);
                } else {
                    callback(result.docs.length, null);
                }
            });
        }).catch(err => callback(0, err));
    },

    closeDB,

    getDefaultConfig: () => DEFAULT_CONFIG
};
