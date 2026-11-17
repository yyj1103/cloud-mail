import { defineStore } from 'pinia'
import { unreadCount } from "@/request/dm.js";

export const useDmStore = defineStore('dm', {
    state: () => ({
        unread: 0,
    }),
    actions: {
        refreshUnread() {
            unreadCount().then(n => {
                this.unread = n || 0
            }).catch(() => {
            })
        }
    }
})
