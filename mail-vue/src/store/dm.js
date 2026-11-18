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
        // 消息缓存：按对方 userId 分会话存，只留最新 30 条，离开对话不清空；
        // 进对话先画缓存、后台走增量拉取悄悄刷新，只有从没打开过的对话才显示“加载中…”
        messagesCache: new Map(),
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
        // 取某会话缓存的消息：没有或已空返回 null（调用方按“从没打开过”处理，重新拉取）
        cachedMessages(userId) {
            const list = this.messagesCache.get(userId)
            return list && list.length ? list : null
        },
        // 存某会话的消息：只留最新 30 条（消息按 id 升序，老的在前）；
        // 空列表表示该会话已没有消息，删掉缓存，下次进对话重新拉取
        cacheMessages(userId, list) {
            if (userId == null) return
            if (!list || !list.length) {
                this.messagesCache.delete(userId)
                return
            }
            this.messagesCache.set(userId, list.slice(-30))
            // 会话数也封顶：超过 50 个会话时删掉最早进缓存的
            while (this.messagesCache.size > 50) {
                this.messagesCache.delete(this.messagesCache.keys().next().value)
            }
        },
        // 删好友时把该会话的消息缓存一起清掉
        dropMessages(userId) {
            this.messagesCache.delete(userId)
        },
    }
})
