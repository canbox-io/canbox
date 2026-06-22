import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useShortcutStore = defineStore('shortcut', () => {
    const shortcutList = ref([]);
    let initialized = false;

    async function fetchAll() {
        try {
            const result = await window.api.shortcutManager.getAll();
            if (result.success) {
                shortcutList.value = result.data;
            }
        } catch (e) {
            console.error('Failed to fetch shortcut list:', e);
        }
    }

    function init() {
        if (initialized) return;
        initialized = true;

        fetchAll();

        // 监听主进程推送的变更事件
        window.api.shortcutManager.onChanged((list) => {
            shortcutList.value = list;
        });
    }

    async function unregister(accelerator) {
        try {
            const result = await window.api.shortcutManager.unregister(accelerator);
            return result;
        } catch (e) {
            console.error('Failed to unregister shortcut:', e);
            return { success: false, msg: e.message };
        }
    }

    return { shortcutList, fetchAll, init, unregister };
});
