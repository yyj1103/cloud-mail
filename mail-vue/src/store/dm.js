import { defineStore } from 'pinia'
import { unreadCount } from "@/request/dm.js";

export const useDmStore = defineStore('dm', {
    state: () => ({
        unread: 0,
        // 由联系人页设置的待打开好友：dm 页挂载后打开与该好友的会话
        pendingFriend: null,
        // 手机端是否正在聊天窗口内（用于隐藏底部导航 / FAB）
        inChat: false,
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
