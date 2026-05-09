import { defineStore } from 'pinia';

export const useZoomStore = defineStore('zoom', {
    state: () => ({
        factor: 1.0
    }),

    actions: {
        async init() {
            const result = await window.api.zoom.get();
            if (result.success) {
                this.factor = result.factor;
            }

            // 监听 zoom 变化事件
            window.api.zoom.onChanged((newFactor) => {
                this.factor = newFactor;
            });
        },

        async set(factor) {
            const result = await window.api.zoom.set(factor);
            if (result.success) {
                this.factor = result.factor;
            }
            return result;
        },

        async reset() {
            const result = await window.api.zoom.reset();
            if (result.success) {
                this.factor = 1.0;
            }
            return result;
        }
    }
});
