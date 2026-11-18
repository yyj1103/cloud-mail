import { defineStore } from 'pinia'
import { unreadCount, listFriends, listConversations, listFriendRequests } from "@/request/dm.js";

export const useDmStore = defineStore('dm', {
    state: () => ({
        unread: 0,
        // 由联系人页设置的待打开好友：dm 页挂载后打开与该好友的会话
        pendingFriend: null,
        // 手机端是否正在聊天窗口内（用于隐藏底部导航 / FAB）
        inChat: false,
        // 列表缓存：离开页面不清空，再进页先画缓存、后台悄悄刷新；
        // 只有第一次打开、缓存为空时才显示“加载中…”
        friends: [],
        friendsLoaded: false,
        conversations: [],
        conversationsLoaded: false,
        incomingRequests: [],
        requestsLoaded: false,
        // 头像 base64 缓存：服务端只在 avatarVer 变化时才回传头像，没变化时靠这份缓存补；
        // 放 store 里，离开页面不丢，再进页头像不用重新下载
        avatarCache: new Map(),
    }),
    actions: {
        refreshUnread() {
            unreadCount().then(n => {
                this.unread = n || 0
            }).catch(() => {
            })
        },
        knownAvatarVers() {
            const vers = {}
            this.avatarCache.forEach((v, k) => { vers[k] = v.ver })
            return vers
        },
        fillAvatars(items) {
            for (const it of items || []) {
                if (!it || it.userId == null) continue
                if (it.avatar) {
                    this.avatarCache.set(it.userId, { ver: it.avatarVer || '', data: it.avatar })
                    continue
                }
                const cached = this.avatarCache.get(it.userId)
                if (cached && it.avatarVer && cached.ver === it.avatarVer) {
                    it.avatar = cached.data
                }
            }
        },
        // 好友列表：失败时抛错，由调用方处理（联系人页会显示空状态）
        async loadFriends() {
            const data = await listFriends()
            this.friends = data || []
            this.friendsLoaded = true
            return this.friends
        },
        // 会话列表：失败时不碰缓存（后台刷新失败不能把已画出来的列表清空）
        async loadConversations() {
            let convs
            try {
                convs = await listConversations(this.knownAvatarVers())
            } catch (e) {
                return this.conversations
            }
            this.fillAvatars(convs)
            this.conversations = convs || []
            this.conversationsLoaded = true
            return this.conversations
        },
        // 好友申请：失败时不碰缓存
        async loadRequests() {
            let reqs
            try {
                reqs = await listFriendRequests(this.knownAvatarVers())
            } catch (e) {
                return this.incomingRequests
            }
            this.fillAvatars(reqs?.incoming)
            this.incomingRequests = reqs?.incoming || []
            this.requestsLoaded = true
            return this.incomingRequests
        },
    }
})
