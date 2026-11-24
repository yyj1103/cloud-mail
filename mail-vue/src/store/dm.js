import { defineStore } from 'pinia'
import { unreadCount, listFriends, listConversations, listFriendRequests } from "@/request/dm.js";
import { useUserStore } from "@/store/user.js";

// ---------- 持久化用的序列化 ----------
// 联系人 / 会话 / 聊天记录要存到手机本地（localStorage），下次打开先画上次的，
// 后台再悄悄去服务器刷新——这样重新进 App 不用每次都等“加载中…”。
// 有三样东西不能原样存：
// 1. messagesCache 是 Map，JSON 存不了：序列化成 [userId, 消息列表] 数组，读回时再转回 Map。
// 2. 头像 base64 太大：friends / conversations / requests 里的 avatar 字段去掉，
//    只留 avatarVer；下次打开先显示字母头像，后台一刷新头像就回来（服务端在
//    avatarVer 对不上时会重新下发头像）。
// 3. 图片消息的 content 是 base64（可达几百 KB）：不进本地存储，置空；
//    下次打开进对话时后台一刷新图片就回来。纯文字消息最多 2000 字，
//    只留最近 20 个会话、每会话最新 30 条，本地存得下。
// 删除要彻底：撤回 / 删好友本来就会同步改 messagesCache（见下面 cacheMessages /
// dropMessages），改完会重新写回本地存储，所以删掉的消息不会从本地缓存里复活；
// 后台刷新时也以服务器为准——服务器上没有的消息，轮询会把它从列表里去掉。
function stripAvatar(item) {
    if (!item || typeof item !== 'object') return item
    const { avatar, ...rest } = item
    return rest
}
function stripImageContent(msg) {
    if (!msg || typeof msg !== 'object') return msg
    if (msg.type === 1) return { ...msg, content: '' }
    if (msg.replyTo && msg.replyTo.type === 1) {
        return { ...msg, replyTo: { ...msg.replyTo, content: '' } }
    }
    return msg
}
function serializeDmCache(state) {
    const cache = state.messagesCache
    const entries = cache instanceof Map ? [...cache.entries()] : []
    return JSON.stringify({
        cacheOwner: state.cacheOwner || '',
        friends: (state.friends || []).map(stripAvatar),
        friendsLoaded: !!state.friendsLoaded,
        conversations: (state.conversations || []).map(stripAvatar),
        conversationsLoaded: !!state.conversationsLoaded,
        incomingRequests: (state.incomingRequests || []).map(stripAvatar),
        requestsLoaded: !!state.requestsLoaded,
        // 只留最近 20 个会话、每会话最新 30 条
        messagesCache: entries.slice(-20).map(([userId, list]) => [
            userId,
            (list || []).slice(-30).map(stripImageContent),
        ]),
    })
}
// 显示名字：有备注就显示备注，没有就显示对方起的名字，再没有就显示邮箱
export function displayNameOf(u) {
    if (!u) return ''
    const remark = (u.remark || '').trim()
    if (remark) return remark
    return u.name || u.email || ''
}

function deserializeDmCache(str) {
    const data = JSON.parse(str)
    return {
        ...data,
        messagesCache: new Map((data.messagesCache || []).map(([k, v]) => [k, v])),
    }
}

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
        // 这份本地缓存属于哪个账号（邮箱）：换账号登录时，旧账号的联系人/聊天记录
        // 不能画给新账号看——ensureOwner 会在取数前比对，不对就先清掉
        cacheOwner: '',
    }),
    // 持久化到 localStorage：pendingFriend / inChat / unread / avatarCache 不存。
    // serializer 在上面：Map 转数组、头像和图片 base64 不进本地存储。
    persist: {
        key: 'dm',
        pick: ['cacheOwner', 'friends', 'friendsLoaded', 'conversations', 'conversationsLoaded', 'incomingRequests', 'requestsLoaded', 'messagesCache'],
        serializer: {
            serialize: serializeDmCache,
            deserialize: deserializeDmCache,
        },
    },
    actions: {
        // 取数前先确认这份本地缓存是当前登录账号的；不是就清掉（换账号/退出后重登都走这里）。
        // 当前还没拿到用户信息时（email 为空）不判断、不清空，等拿到后再说。
        ensureOwner() {
            let email = ''
            try { email = useUserStore().user?.email || '' } catch (e) {}
            if (!email) return
            if (this.cacheOwner && this.cacheOwner !== email) {
                this.clearCache()
            }
            this.cacheOwner = email
        },
        // 清掉全部本地 DM 缓存（联系人、会话、申请、聊天记录）：退出登录、换账号、
        // 以及任何“删掉就不要再出现”的场景都走这里。删掉就是删掉，不会复活。
        clearCache() {
            this.friends = []
            this.friendsLoaded = false
            this.conversations = []
            this.conversationsLoaded = false
            this.incomingRequests = []
            this.requestsLoaded = false
            this.messagesCache = new Map()
            this.cacheOwner = ''
        },
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
        // 数据没变时不换数组，避免后台刷新时列表重画、把正在点的那行换掉
        async loadFriends() {
            this.ensureOwner()
            const data = await listFriends()
            const list = data || []
            const same = this.friends.length === list.length && this.friends.every((f, i) => {
                const g = list[i]
                return f.userId === g.userId && f.email === g.email && (f.name || '') === (g.name || '') && (f.remark || '') === (g.remark || '') && (f.avatarVer || '') === (g.avatarVer || '') && !!f.avatar === !!g.avatar
            })
            if (!same) this.friends = list
            this.friendsLoaded = true
            return this.friends
        },
        // 会话列表：失败时不碰缓存（后台刷新失败不能把已画出来的列表清空）
        async loadConversations() {
            this.ensureOwner()
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
            this.ensureOwner()
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
            this.ensureOwner()
            const list = this.messagesCache.get(userId)
            return list && list.length ? list : null
        },
        // 存某会话的消息：只留最新 30 条（消息按 id 升序，老的在前）；
        // 空列表表示该会话已没有消息，删掉缓存，下次进对话重新拉取
        cacheMessages(userId, list) {
            if (userId == null) return
            if (!list || !list.length) {
                this.messagesCache.delete(userId)
            } else {
                this.messagesCache.set(userId, list.slice(-30))
                // 会话数也封顶：超过 50 个会话时删掉最早进缓存的
                while (this.messagesCache.size > 50) {
                    this.messagesCache.delete(this.messagesCache.keys().next().value)
                }
            }
            // 换一个新 Map 引用，保证持久化订阅能收到这次改动（Map 内部改动不一定触发订阅）；
            // 撤回/删除走这里同步写回本地存储，删掉的消息不会复活
            this.messagesCache = new Map(this.messagesCache)
        },
        // 删好友时把该会话的消息缓存一起清掉
        dropMessages(userId) {
            this.messagesCache.delete(userId)
            this.messagesCache = new Map(this.messagesCache)
        },
        // 改备注后立刻更新本地的好友和会话列表，不用等后台刷新；
        // 写进 state 的同时也会写回本地存储（persist），重新进 App 也在
        applyRemark(friendUserId, remark) {
            const r = (remark || '').trim()
            for (const f of this.friends) {
                if (f.userId === friendUserId) f.remark = r
            }
            for (const c of this.conversations) {
                if (c.userId === friendUserId) c.remark = r
            }
        },
    }
})
