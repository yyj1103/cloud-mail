import { defineStore } from 'pinia'
import { EmailUnreadEnum } from '@/enums/email-enum.js'
import { sanitizeEmailHtml } from '@/utils/email-html.js'
import { emailList } from '@/request/email.js'
import { starList } from '@/request/star.js'
import { allEmailList } from '@/request/all-email.js'
import { useAccountStore } from '@/store/account.js'

// 正文补拉的在途集合（模块级，不进 state）：同一封同时只补拉一次
const detailFetching = new Set()

export const useEmailStore = defineStore('email', {
    state: () => ({
        deleteIds: 0,
        starScroll: null,
        emailScroll: null,
        cancelStarEmailId: 0,
        addStarEmailId: 0,
        contentData: {
            email: null,
            delType: null,
            showStar: true,
            showReply: true,
            showUnread: false
        },
        sendScroll: null,
        detailMap: {},
        searchParams: {
            text: '',
            type: 'subject',
            startDate: '',
            endDate: '',
        },
    }),
    persist: {
        pick: ['contentData'],
    },
    actions: {
        setSearchParams(params) {
            this.searchParams = {
                ...this.searchParams,
                ...params,
            }
        },
        fetchList(request) {
            return request(0).then(data => {
                request(1).then(fullData => {
                    const list = Array.isArray(fullData) ? fullData : fullData?.list
                    this.applyFullList(list)
                }).catch(e => {
                    console.error(e)
                })
                return data
            })
        },
        applyFullList(list) {
            if (!list?.length) return
            const currentId = this.contentData.email?.emailId
            for (const item of list) {
                if (!item?.emailId) continue
                if (item.content) item.content = sanitizeEmailHtml(item.content)
                if (!item.attList) item.attList = []
                // 完整列表可能早于「标已读」返回，避免把本地已读状态盖回未读
                const prev = this.detailMap[item.emailId]
                const keepRead = prev?.unread === EmailUnreadEnum.READ
                    || (currentId === item.emailId && this.contentData.email?.unread === EmailUnreadEnum.READ)
                if (keepRead) {
                    item.unread = EmailUnreadEnum.READ
                }
                this.detailMap[item.emailId] = item
                if (currentId && item.emailId === currentId) {
                    this.contentData.email = item
                }
            }
        },
        toContentEmail(email) {
            const id = email?.emailId
            if (id && this.detailMap[id]) {
                return this.detailMap[id]
            }
            return {
                ...email,
                emailId: id || 0,
                content: '',
                text: '',
                attList: [],
                recipient: email?.recipient || '[]',
            }
        },
        markListRead(emailId) {
            const scrolls = [this.emailScroll, this.starScroll, this.sendScroll]
            for (const scroll of scrolls) {
                const list = scroll?.emailList
                if (!list?.length) continue
                const item = list.find(e => e.emailId === emailId)
                if (item) item.unread = EmailUnreadEnum.READ
            }
        },
        // 正文缺失兜底：点开的邮件如果既不在 detailMap、本身又没有正文
        // （打开时还没赶上列表后台 full 拉取，或重进应用后 contentData 存的是空壳），
        // 按文件夹精确定位补拉这一封（full=1，游标 id+1、只要 1 条），补进 detailMap；
        // applyFullList 会把当前这封的 contentData 一起更新，正文自己出现。
        // 正文已在缓存里时不触发，不多一次请求；失败静默，下次打开或手动刷新列表时再补。
        async ensureDetail(mailbox, emailId) {
            if (!emailId || this.detailMap[emailId]) return
            if (detailFetching.has(emailId)) return
            detailFetching.add(emailId)
            try {
                let res = null
                if (mailbox === 'starred') {
                    res = await starList(emailId + 1, 1, 1, { noMsg: true })
                } else if (mailbox === 'all-mail') {
                    res = await allEmailList({ emailId: emailId + 1, size: 1, full: 1, timeSort: 0, type: 'all' }, { noMsg: true })
                } else {
                    // inbox / sent：type 0 收件、1 已发送
                    const accountStore = useAccountStore()
                    const type = mailbox === 'sent' ? 1 : 0
                    res = await emailList(accountStore.currentAccountId, accountStore.currentAccount.allReceive, emailId + 1, 0, 1, type, 1, {}, { noMsg: true })
                }
                const list = Array.isArray(res) ? res : res?.list
                if (list?.length) {
                    this.applyFullList(list)
                }
            } catch (e) {
                console.error(e)
            } finally {
                detailFetching.delete(emailId)
            }
        },
    },
})
