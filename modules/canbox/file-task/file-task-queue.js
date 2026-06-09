/**
 * 文件任务队列
 * 管理任务队列，支持按类型串行执行
 */
const { isRunningState } = require('./file-task-state');

class FileTaskQueue {
    constructor() {
        /**
         * 按类型分组的任务队列
         * @type {Map<string, Array>}
         */
        this.queues = new Map();
    }

    /**
     * 入队
     * @param {Object} task - 任务对象
     */
    enqueue(task) {
        const { type, id } = task;

        if (!this.queues.has(type)) {
            this.queues.set(type, []);
        }

        const queue = this.queues.get(type);

        // 避免重复添加
        if (!queue.find(t => t.id === id)) {
            queue.push(task);
        }
    }

    /**
     * 获取指定类型的队首任务
     * @param {string} type - 任务类型
     * @returns {Object|null}
     */
    peek(type) {
        const queue = this.queues.get(type);
        return queue && queue.length > 0 ? queue[0] : null;
    }

    /**
     * 出队 - 取出并移除队首任务
     * @param {string} type - 任务类型
     * @returns {Object|null}
     */
    dequeue(type) {
        const queue = this.queues.get(type);
        if (!queue || queue.length === 0) {
            return null;
        }
        return queue.shift();
    }

    /**
     * 从队列中移除指定任务
     * @param {string} type - 任务类型
     * @param {string} taskId - 任务ID
     * @returns {boolean}
     */
    remove(type, taskId) {
        const queue = this.queues.get(type);
        if (!queue) return false;

        const index = queue.findIndex(t => t.id === taskId);
        if (index === -1) return false;

        queue.splice(index, 1);
        return true;
    }

    /**
     * 检查指定类型是否有正在运行的任务
     * @param {string} type - 任务类型
     * @param {Map<string, Object>} allTasks - 所有任务 Map
     * @returns {boolean}
     */
    isRunning(type, allTasks) {
        for (const task of allTasks.values()) {
            if (task.type === type && isRunningState(task.status)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取指定类型的队列长度
     * @param {string} type - 任务类型
     * @returns {number}
     */
    size(type) {
        const queue = this.queues.get(type);
        return queue ? queue.length : 0;
    }

    /**
     * 获取所有队列的统计信息
     * @returns {Object}
     */
    getStats() {
        const stats = {};
        for (const [type, queue] of this.queues.entries()) {
            stats[type] = queue.length;
        }
        return stats;
    }

    /**
     * 清空调度队列
     * @param {string} type - 任务类型（可选，不传则清空所有）
     */
    clear(type) {
        if (type) {
            this.queues.delete(type);
        } else {
            this.queues.clear();
        }
    }
}

module.exports = FileTaskQueue;
