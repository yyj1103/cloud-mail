<template>
  <div class="dm-page" ref="dmPageRef" :style="dmPageStyle">
    <div class="dm-side" :class="{ 'side-hidden': mobileChat }">
      <div class="add-friend">
        <el-input
            v-model="searchEmail"
            @keyup.enter="doSearch"
            clearable
        >
          <!-- 本站后缀写死、一直显示：加好友只能搜本站邮箱 -->
          <template #append>@qixuan.ccwu.cc</template>
        </el-input>
        <el-button type="primary" :loading="searchLoading" @click="doSearch">{{ $t('search') }}</el-button>
      </div>
      <div v-if="searchResult" class="search-result">
        <img v-if="searchResult.avatar" class="avatar-img" :src="searchResult.avatar" alt="">
        <div v-else class="letter-avatar">{{ formatName(searchResult.name || searchResult.email) }}</div>
        <div class="result-info">
          <div class="result-name">{{ displayNameOf(searchResult) }}</div>
          <div class="result-email">{{ searchResult.email }}</div>
        </div>
        <el-button
            v-if="searchResult.relation === -1"
            type="primary"
            size="small"
            :loading="requestLoading"
            @click="doSendRequest"
        >{{ $t('dmAddFriend') }}</el-button>
        <el-tag v-else-if="searchResult.relation === 0 && searchResult.isRequester" type="warning" size="small">{{ $t('dmRequestSent') }}</el-tag>
        <el-button
            v-else-if="searchResult.relation === 0 && !searchResult.isRequester"
            type="success"
            size="small"
            @click="doRespond(searchResult.friendId, true)"
        >{{ $t('dmAccept') }}</el-button>
        <el-tag v-else-if="searchResult.relation === 1" type="success" size="small">{{ $t('dmAlreadyFriend') }}</el-tag>
        <el-button
            v-else-if="searchResult.relation === 2"
            type="primary"
            size="small"
            :loading="requestLoading"
            @click="doSendRequest"
        >{{ $t('dmAddFriend') }}</el-button>
      </div>

      <div v-if="incomingRequests.length" class="request-section">
        <div class="section-title">{{ $t('dmFriendRequests') }}</div>
        <div v-for="req in incomingRequests" :key="req.friendId" class="request-item">
          <img v-if="req.avatar" class="avatar-img" :src="req.avatar" alt="">
          <div v-else class="letter-avatar small">{{ formatName(req.name || req.email) }}</div>
          <div class="result-info">
            <div class="result-name">{{ req.name }}</div>
            <div class="result-email">{{ req.email }}</div>
          </div>
          <el-button type="success" size="small" @click="doRespond(req.friendId, true)">{{ $t('dmAccept') }}</el-button>
          <el-button type="danger" size="small" plain @click="doRespond(req.friendId, false)">{{ $t('dmReject') }}</el-button>
        </div>
      </div>

      <el-scrollbar class="conversation-list">
        <div v-if="conversationsLoading && !conversations.length && !incomingRequests.length" class="loading-tip">{{ $t('dmLoading') }}</div>
        <div
            v-for="conv in conversations"
            :key="conv.userId"
            class="conversation-item"
            :class="{ active: currentFriend && currentFriend.userId === conv.userId, 'has-unread': conv.unread > 0 }"
            @click="openConversation(conv)"
        >
          <img v-if="conv.avatar" class="avatar-img" :src="conv.avatar" alt="">
          <div v-else class="letter-avatar">{{ formatName(displayNameOf(conv)) }}</div>
          <div class="conv-info">
            <div class="conv-name">{{ displayNameOf(conv) }}</div>
            <div class="conv-last">{{ conv.lastMessage ? (conv.lastMessage.type === 1 ? $t('dmImageMsg') : conv.lastMessage.content) : conv.email }}</div>
          </div>
          <div class="conv-right">
            <span v-if="conv.lastMessage" class="conv-time">{{ formatTime(conv.lastMessage.createTime) }}</span>
            <el-badge v-if="conv.unread > 0" :value="conv.unread" :max="99" class="conv-badge" />
          </div>
        </div>
        <el-empty v-if="!conversationsLoading && !conversations.length && !incomingRequests.length" :description="$t('dmNoFriends')" />
      </el-scrollbar>
    </div>

    <div class="dm-main" :class="{ 'main-show': mobileChat }">
      <template v-if="currentFriend">
        <div class="chat-header">
          <template v-if="selecting">
            <el-button class="select-exit" link @click="exitSelectMode">✕</el-button>
            <div class="select-count">{{ $t('dmSelectedCount', { n: selectedIds.size }) }}</div>
            <div class="chat-title"></div>
            <button v-if="canEdit" class="select-action" type="button" :title="$t('dmEdit')" @click="startEdit"><Icon icon="mdi:pencil-outline" width="20" height="20" /></button>
            <button v-if="canCopy" class="select-action" type="button" :title="$t('dmCopy')" @click="doCopySelected"><Icon icon="mdi:content-copy" width="20" height="20" /></button>
            <button class="select-action" type="button" :title="$t('dmForward')" @click="openForwardDialog"><Icon icon="mdi:share-outline" width="20" height="20" /></button>
            <button v-if="canDelete" class="select-action danger" type="button" :title="$t('delete')" @click="askDeleteSelected"><Icon icon="mdi:trash-can-outline" width="20" height="20" /></button>
          </template>
          <template v-else>
            <el-button v-if="isMobile" class="back-btn" link @click="mobileChat = false">&lt; {{ $t('dmFriends') }}</el-button>
            <img v-if="currentFriend.avatar" class="avatar-img friend-avatar" :src="currentFriend.avatar" alt="" @dblclick="showFriendAvatar = true">
            <div v-else class="letter-avatar">{{ formatName(displayNameOf(currentFriend)) }}</div>
            <div class="chat-title">
              <div class="chat-name">{{ displayNameOf(currentFriend) }}</div>
            </div>
            <el-dropdown trigger="click">
              <el-button link class="more-btn">···</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="askRemark">{{ $t('dmRemark') }}</el-dropdown-item>
                  <el-dropdown-item @click="doRemoveFriend">{{ $t('dmRemoveFriend') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </div>
        <el-scrollbar ref="msgScrollRef" class="message-list">
          <div v-if="messagesLoading && !messages.length" class="loading-tip">{{ $t('dmLoading') }}</div>
          <div v-if="hasMore" class="load-more">
            <el-button link @click="loadMore">{{ $t('dmLoadMore') }}</el-button>
          </div>
          <template v-for="(msg, index) in messages" :key="msg.messageId">
            <div v-if="showTimeLabel(index)" class="time-label">{{ formatTime(msg.createTime) }}</div>
            <div
                class="message-row"
                :class="{ mine: msg.senderUserId === userStore.user.userId, selecting, selected: selectedIds.has(msg.messageId) }"
                @click="onMessageRowClick(msg)"
            >
              <span v-if="selecting" class="select-circle" :class="{ checked: selectedIds.has(msg.messageId) }">
                <span v-if="selectedIds.has(msg.messageId)">✓</span>
              </span>
              <img v-if="msg.senderUserId !== userStore.user.userId && currentFriend.avatar" class="msg-avatar friend-avatar" :src="currentFriend.avatar" alt="" @dblclick="showFriendAvatar = true">
              <div v-else-if="msg.senderUserId !== userStore.user.userId" class="msg-avatar letter-avatar">{{ formatName(displayNameOf(currentFriend)) }}</div>
              <div class="message-body">
                <div v-if="msg.replyTo" class="reply-quote">
                  <div class="reply-quote-name">{{ replySenderName(msg.replyTo) }}</div>
                  <div v-if="msg.replyTo.type === 1" class="reply-quote-content">{{ $t('dmImageMsg') }}</div>
                  <div v-else class="reply-quote-content"><template v-for="(seg, si) in linkSegments(msg.replyTo.content)" :key="si"><a v-if="seg.t === 'link'" :href="seg.v" @click.stop.prevent="onMessageLink(seg.v)">{{ seg.v }}</a><span v-else>{{ seg.v }}</span></template></div>
                </div>
                <el-image v-if="msg.type === 1" class="msg-image" :src="msg.content" :preview-src-list="selecting ? [] : [msg.content]" fit="cover" @contextmenu.prevent="onMessageContextMenu(msg)" />
                <div v-else class="message-bubble" @contextmenu.prevent="onMessageContextMenu(msg)">
                  <div class="message-content"><template v-for="(seg, si) in linkSegments(msg.content)" :key="si"><a v-if="seg.t === 'link'" :href="seg.v" @click.stop.prevent="onMessageLink(seg.v)">{{ seg.v }}</a><span v-else>{{ seg.v }}</span></template></div>
                  <div v-if="msg.isEdited" class="edited-mark">{{ $t('dmEdited') }}</div>
                </div>
              </div>
              <img v-if="msg.senderUserId === userStore.user.userId && userStore.user.avatar" class="msg-avatar" :src="userStore.user.avatar" alt="">
              <div v-else-if="msg.senderUserId === userStore.user.userId" class="msg-avatar letter-avatar">{{ formatName(userStore.user.email) }}</div>
            </div>
          </template>
        </el-scrollbar>
        <div v-if="selecting" class="select-actions">
          <el-button class="select-action-btn" :disabled="selectedMessages.length !== 1" @click="startReply">↩ {{ $t('dmReply') }}</el-button>
          <el-button class="select-action-btn" type="primary" :disabled="!selectedMessages.length" @click="openForwardDialog">↗ {{ $t('dmForward') }}</el-button>
        </div>
        <div v-else class="chat-input">
          <div v-if="replyTarget" class="reply-bar">
            <div class="reply-bar-info">
              <span class="reply-bar-title">{{ $t('dmReplyingTo') }} {{ replyTargetName }}：</span>
              <span class="reply-bar-content">{{ replyTargetSummary }}</span>
            </div>
            <el-button link @click="cancelReply">✕</el-button>
          </div>
          <div v-if="editingMessage" class="reply-bar">
            <div class="reply-bar-info">
              <span class="reply-bar-title">{{ $t('dmEditingMsg') }}</span>
            </div>
            <el-button link @click="cancelEdit">✕</el-button>
          </div>
          <div v-show="emojiShow" class="emoji-panel">
            <span v-for="e in emojiList" :key="e" @click="insertEmoji(e)">{{ e }}</span>
          </div>
          <div class="input-bar">
            <el-dropdown trigger="click" @command="onPlusCommand">
              <button class="tool-btn" type="button">＋</button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="race">
                    <span>🏃 {{ $t('cmfly') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item command="piano">
                    <span>🎹 {{ $t('piano') }}</span>
                  </el-dropdown-item>
                  <el-dropdown-item command="ra">
                    <span>⚔️ {{ $t('steelDawn') }}</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <button class="tool-btn" type="button" @click="toggleEmoji">😊</button>
            <el-input
                ref="inputRef"
                v-model="inputContent"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 4 }"
                :placeholder="$t('dmTypeMessage')"
                :maxlength="2000"
                @keydown.enter.exact.prevent="doSend"
                @focus="onInputFocus"
            />
            <button class="tool-btn" type="button" @click="imageInput.click()">🖼</button>
            <input ref="imageInput" type="file" accept="image/jpeg,image/png,image/gif,image/webp" style="display: none" @change="onImageFile">
            <el-button class="send-btn" type="primary" circle :loading="sendLoading" :disabled="!inputContent.trim()" @click="doSend">{{ editingMessage ? '✓' : '➤' }}</el-button>
          </div>
        </div>
      </template>
      <el-empty v-else :description="$t('dmSelectFriend')" />
    </div>
    <el-dialog v-model="showFriendAvatar" :title="displayNameOf(currentFriend)" width="320" align-center>
      <img v-if="currentFriend?.avatar" :src="currentFriend.avatar" class="avatar-preview-img" alt="">
    </el-dialog>
    <el-dialog v-model="forwardDialogVisible" :title="$t('dmForwardTitle')" width="340" align-center>
      <div class="forward-list">
        <div v-for="f in conversations" :key="f.userId" class="forward-item" :class="{ active: forwardTarget && forwardTarget.userId === f.userId }" @click="forwardTarget = f">
          <img v-if="f.avatar" class="avatar-img" :src="f.avatar" alt="">
          <div v-else class="letter-avatar">{{ formatName(f.name || f.email) }}</div>
          <div class="result-info">
            <div class="result-name">{{ displayNameOf(f) }}</div>
            <div class="result-email">{{ f.email }}</div>
          </div>
          <span v-if="forwardTarget && forwardTarget.userId === f.userId" class="forward-check">✓</span>
        </div>
        <el-empty v-if="!conversations.length" :description="$t('dmNoFriends')" />
      </div>
      <template #footer>
        <el-button @click="forwardDialogVisible = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="forwardLoading" :disabled="!forwardTarget" @click="doForward">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from "vue-i18n";
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useUserStore } from "@/store/user.js";
import { useDmStore, displayNameOf } from "@/store/dm.js";
import { useUiStore } from "@/store/ui.js";
import { tzDayjs } from "@/utils/day.js";
import {
  searchUser,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  setFriendRemark,
  sendMessage,
  listMessages,
  deleteMessage,
  editMessage
} from "@/request/dm.js";

const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore();
const dmStore = useDmStore();
const uiStore = useUiStore();

const searchEmail = ref('')
const searchLoading = ref(false)
const searchResult = ref(null)
const requestLoading = ref(false)
const incomingRequests = ref([])
const conversations = ref([])
const conversationsLoading = ref(false)
const currentFriend = ref(null)
const messages = ref([])
const messagesLoading = ref(false)
const inputContent = ref('')
const sendLoading = ref(false)
const emojiShow = ref(false)
const inputRef = ref(null)
const imageInput = ref(null)
const emojiList = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '😎', '🤔', '😴', '😭', '😡', '🥺', '😏', '🙂', '😉', '😅', '😢', '😋', '🤗', '😷', '🤢', '🥳', '😤', '🙄', '😬', '🤐', '😳', '🥰', '😇', '🤩', '😈', '👍', '👎', '👏', '🙏', '👌', '✌️', '🤞', '👋', '💪', '🙌', '👀', '💕', '💔', '💯', '🔥', '✨', '🎉', '🎁', '🌹', '🍓', '🍕', '☕', '⚽', '🎮', '🚗', '✈️', '🌙', '⭐', '💤', '❓', '❗']
const msgScrollRef = ref(null)
const dmPageRef = ref(null)
// 键盘弹起时 .dm-page 的高度（px）：visualViewport 兜底，null 表示用 CSS（100dvh - 50px - var(--safe-top)）
const kbPageHeight = ref(null)
const dmPageStyle = computed(() => (kbPageHeight.value ? { height: kbPageHeight.value + 'px' } : null))
const msgPage = ref(1)
const hasMore = ref(false)
const mobileChat = ref(false)
const showFriendAvatar = ref(false)
const isMobile = computed(() => window.innerWidth < 768)
// 本站域名写死：加好友只能搜本站邮箱，不能按用户名（昵称/显示名）搜
const SITE_DOMAIN = 'qixuan.ccwu.cc'

// 选择模式（Telegram 风格长按多选）
const selecting = ref(false)
const selectedIds = ref(new Set())
const replyTarget = ref(null)
const editingMessage = ref(null)
const forwardDialogVisible = ref(false)
const forwardTarget = ref(null)
const forwardLoading = ref(false)

const selectedMessages = computed(() => messages.value.filter(m => selectedIds.value.has(m.messageId)))
const selectedMine = computed(() => selectedMessages.value.filter(m => m.senderUserId === userStore.user.userId))
const canCopy = computed(() => selectedMessages.value.some(m => m.type === 0))
const canEdit = computed(() => selectedMessages.value.length === 1
    && selectedMessages.value[0].senderUserId === userStore.user.userId
    && selectedMessages.value[0].type === 0)
const canDelete = computed(() => selectedMine.value.length > 0)
const replyTargetName = computed(() => {
  if (!replyTarget.value) return ''
  return replyTarget.value.senderUserId === userStore.user.userId
      ? t('dmMe')
      : displayNameOf(currentFriend.value)
})
const replyTargetSummary = computed(() => {
  if (!replyTarget.value) return ''
  return replyTarget.value.type === 1 ? t('dmImageMsg') : (replyTarget.value.content || '').slice(0, 60)
})

// 只收 @ 前面的用户名部分，一定补上写死的本站后缀；
// 输了外站完整邮箱时返回 null，由调用方提示“只能搜索本站邮箱”
function normalizeEmail(input) {
  const value = input.trim()
  if (!value) return ''
  if (!value.includes('@')) return value + '@' + SITE_DOMAIN
  const [local, domain] = value.split('@')
  if ((domain || '').trim().toLowerCase() !== SITE_DOMAIN) return null
  const name = (local || '').trim()
  return name ? name + '@' + SITE_DOMAIN : ''
}

function formatName(text) {
  return (text || '')[0]?.toUpperCase() || ''
}

function formatTime(time) {
  if (!time) return ''
  const d = tzDayjs(time)
  return d.isSame(tzDayjs(), 'day') ? d.format('HH:mm') : d.format('MM-DD HH:mm')
}

function showTimeLabel(index) {
  if (index === 0) return true
  const prev = tzDayjs(messages.value[index - 1].createTime)
  const cur = tzDayjs(messages.value[index].createTime)
  return cur.diff(prev, 'minute') > 5
}

function enterSelectMode(msg) {
  selecting.value = true
  selectedIds.value = new Set([msg.messageId])
  emojiShow.value = false
}

function exitSelectMode() {
  selecting.value = false
  selectedIds.value = new Set()
}

function toggleSelect(msg) {
  const next = new Set(selectedIds.value)
  if (next.has(msg.messageId)) {
    next.delete(msg.messageId)
  } else {
    next.add(msg.messageId)
  }
  selectedIds.value = next
  if (!next.size) {
    exitSelectMode()
  }
}

function onMessageContextMenu(msg) {
  if (selecting.value) {
    toggleSelect(msg)
    return
  }
  enterSelectMode(msg)
}

function onMessageRowClick(msg) {
  if (selecting.value) {
    toggleSelect(msg)
  }
}

function replySenderName(replyTo) {
  if (!replyTo) return ''
  return replyTo.senderUserId === userStore.user.userId
      ? t('dmMe')
      : displayNameOf(currentFriend.value)
}

// 消息里的链接点得开：把文本按 URL 切成一段段，链接渲染成 <a>；
// 本站的游戏邀请链接（/race?code=、/piano?code=）直接在应用内跳过去，其它链接新窗口打开
const LINK_RE = /(https?:\/\/[^\s]+)/g
const LINK_TRAIL = '.,!?:;。，、；：！？）)]'
function linkSegments(text) {
  if (!text) return []
  const out = []
  let last = 0
  for (const m of text.matchAll(LINK_RE)) {
    let url = m[0]
    let trail = ''
    while (url && LINK_TRAIL.includes(url[url.length - 1])) {
      trail = url[url.length - 1] + trail
      url = url.slice(0, -1)
    }
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) })
    if (url) out.push({ t: 'link', v: url })
    if (trail) out.push({ t: 'text', v: trail })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}
function onMessageLink(url) {
  try {
    const u = new URL(url)
    if (u.origin === location.origin && (u.pathname === '/race' || u.pathname === '/piano' || u.pathname === '/ra' || u.pathname === '/dance')) {
      router.push(u.pathname + u.search)
      return
    }
  } catch (e) { /* 不是合法链接就按普通外链处理 */ }
  window.open(url, '_blank')
}
function onPlusCommand(cmd) {
  if (!currentFriend.value) return
  router.push({ name: cmd, query: { dm: currentFriend.value.userId } })
}

function startReply() {
  const msg = selectedMessages.value[0]
  if (!msg) return
  replyTarget.value = msg
  exitSelectMode()
  nextTick(() => inputRef.value?.textarea?.focus())
}

function cancelReply() {
  replyTarget.value = null
}

function startEdit() {
  const msg = selectedMessages.value[0]
  if (!msg || msg.senderUserId !== userStore.user.userId || msg.type !== 0) return
  editingMessage.value = msg
  inputContent.value = msg.content
  exitSelectMode()
  nextTick(() => {
    const ta = inputRef.value?.textarea
    if (ta) {
      ta.focus()
      ta.setSelectionRange(ta.value.length, ta.value.length)
    }
  })
}

function cancelEdit() {
  editingMessage.value = null
  inputContent.value = ''
}

async function doSaveEdit() {
  const content = inputContent.value.trim()
  if (!content || !editingMessage.value || sendLoading.value) return
  sendLoading.value = true
  try {
    await editMessage(editingMessage.value.messageId, content)
    const target = messages.value.find(m => m.messageId === editingMessage.value.messageId)
    if (target) {
      target.content = content
      target.isEdited = 1
    }
    // 原地改了内容，同步写回缓存
    dmStore.cacheMessages(currentFriend.value.userId, messages.value)
    editingMessage.value = null
    inputContent.value = ''
    await refreshAll()
  } finally {
    sendLoading.value = false
  }
}

async function doCopySelected() {
  const texts = selectedMessages.value.filter(m => m.type === 0).map(m => m.content)
  if (!texts.length) return
  const text = texts.join('\n')
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  ElMessage({ message: t('dmCopied'), type: 'success', plain: true })
  exitSelectMode()
}

function openForwardDialog() {
  if (!selectedMessages.value.length) return
  forwardTarget.value = null
  forwardDialogVisible.value = true
}

async function doForward() {
  if (!forwardTarget.value || forwardLoading.value) return
  const targets = [...selectedMessages.value].sort((a, b) => a.messageId - b.messageId)
  forwardLoading.value = true
  try {
    for (const m of targets) {
      await sendMessage(forwardTarget.value.userId, m.content, m.type)
    }
    ElMessage({ message: t('dmForwarded'), type: 'success', plain: true })
    forwardDialogVisible.value = false
    exitSelectMode()
    await refreshAll()
  } finally {
    forwardLoading.value = false
  }
}

function askDeleteSelected() {
  const mine = selectedMine.value
  if (!mine.length) return
  ElMessageBox.confirm(t('dmRecallMessageConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    for (const m of mine) {
      await deleteMessage(m.messageId)
    }
    const ids = new Set(mine.map(m => m.messageId))
    messages.value = messages.value.filter(m => !ids.has(m.messageId))
    // 撤回后本地列表变了，同步写回缓存（下次进对话不再出现已撤回的消息）
    dmStore.cacheMessages(currentFriend.value.userId, messages.value)
    exitSelectMode()
    await refreshAll()
  })
}

function scrollToBottom() {
  nextTick(() => {
    const wrap = msgScrollRef.value?.$el?.querySelector('.el-scrollbar__wrap')
    if (wrap) {
      wrap.scrollTop = wrap.scrollHeight
    }
  })
}

async function refreshAll() {
  conversationsLoading.value = true
  try {
    // 会话和申请都缓存在 dm store 里：refreshAll 每次都刷新 store，
    // 页面挂载时先画缓存（见 onMounted），所以这里即使 loading 为 true，
    // 有缓存时模板也不会再显示“加载中…”
    const [convs, reqs] = await Promise.all([
      dmStore.loadConversations(),
      dmStore.loadRequests()
    ])
    conversations.value = convs || []
    incomingRequests.value = reqs || []
    if (currentFriend.value) {
      const updated = conversations.value.find(cv => cv.userId === currentFriend.value.userId)
      if (updated) currentFriend.value = updated
    }
    dmStore.refreshUnread()
  } finally {
    conversationsLoading.value = false
  }
}

async function doSearch() {
  const email = normalizeEmail(searchEmail.value)
  if (email === null) {
    ElMessage({ message: t('dmOnlySiteEmail'), type: 'warning', plain: true })
    return
  }
  if (!email) return
  searchLoading.value = true
  searchResult.value = null
  try {
    searchResult.value = await searchUser(email)
  } finally {
    searchLoading.value = false
  }
}

async function doSendRequest() {
  if (!searchResult.value) return
  requestLoading.value = true
  try {
    await sendFriendRequest(searchResult.value.email)
    ElMessage({ message: t('dmRequestSentMsg'), type: 'success', plain: true })
    searchResult.value = await searchUser(searchResult.value.email)
    await refreshAll()
  } finally {
    requestLoading.value = false
  }
}

async function doRespond(friendId, accept) {
  await respondFriendRequest(friendId, accept)
  ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  searchResult.value = null
  searchEmail.value = ''
  await refreshAll()
}

// 改备注：留空就是清除备注；只改自己看的名字，对方看不到
async function askRemark() {
  if (!currentFriend.value) return
  try {
    const { value } = await ElMessageBox.prompt(currentFriend.value.email, t('dmRemarkTitle'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      inputValue: currentFriend.value.remark || '',
      inputPlaceholder: t('dmRemarkPlaceholder'),
      inputValidator: (v) => (v || '').trim().length <= 20 || t('dmRemarkTooLong'),
    })
    const remark = (value || '').trim()
    await setFriendRemark(currentFriend.value.userId, remark)
    dmStore.applyRemark(currentFriend.value.userId, remark)
    currentFriend.value.remark = remark
    ElMessage({ message: t('dmRemarkSaved'), type: 'success', plain: true })
  } catch (e) {
    // 点取消不做任何事；服务端报错已由请求拦截器提示
  }
}

async function doRemoveFriend() {
  if (!currentFriend.value) return
  ElMessageBox.confirm(t('dmRemoveConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    const friendUserId = currentFriend.value.userId
    await removeFriend(friendUserId)
    currentFriend.value = null
    messages.value = []
    // 删好友连同该会话的消息缓存一起清掉
    dmStore.dropMessages(friendUserId)
    mobileChat.value = false
    exitSelectMode()
    replyTarget.value = null
    editingMessage.value = null
    inputContent.value = ''
    await refreshAll()
  })
}

async function openConversation(conv) {
  currentFriend.value = conv
  messages.value = []
  msgPage.value = 1
  hasMore.value = false
  mobileChat.value = true
  exitSelectMode()
  replyTarget.value = null
  editingMessage.value = null
  inputContent.value = ''
  // 消息缓存优先：有缓存先画上次的消息、不显示“加载中…”；后台走增量拉取悄悄刷新
  // （新消息进来、对方撤回的消息消失都由 pollMessages 处理）；只有从没打开过的对话才重新拉取
  const cached = dmStore.cachedMessages(conv.userId)
  if (cached) {
    messages.value = cached
    hasMore.value = cached.length >= 30
    scrollToBottom()
    try {
      await pollMessages()
    } catch (e) {
      // 后台刷新失败就留着缓存，下次 10 秒轮询再试
    }
  } else {
    await loadMessages(true, true)
  }
}

async function loadMessages(reset, scroll) {
  if (!currentFriend.value) return
  messagesLoading.value = true
  try {
    const list = await listMessages(currentFriend.value.userId, msgPage.value, 30)
    if (reset) {
      messages.value = list || []
    } else {
      messages.value = [...(list || []), ...messages.value]
    }
    hasMore.value = (list || []).length >= 30
    // 写回会话消息缓存（只留最新 30 条），下次进对话直接画
    dmStore.cacheMessages(currentFriend.value.userId, messages.value)
    if (scroll) {
      scrollToBottom()
    }
  } finally {
    messagesLoading.value = false
  }
}

async function pollMessages() {
  if (!currentFriend.value) return
  if (!messages.value.length) {
    await loadMessages(true, false)
    return
  }
  const lastId = messages.value[messages.value.length - 1].messageId
  const res = await listMessages(currentFriend.value.userId, 1, 30, lastId)
  if (!res) return
  if (Array.isArray(res)) {
    messages.value = res
    // 增量结果是全量列表时也写回缓存
    dmStore.cacheMessages(currentFriend.value.userId, messages.value)
    return
  }
  const { list, ids } = res
  if (Array.isArray(ids)) {
    const idSet = new Set(ids)
    const minId = ids.length ? Math.min(...ids) : Infinity
    // 对方撤回的消息在服务端已不可见，本地同步去掉（早于可见窗口的老消息不动）
    messages.value = messages.value.filter(m => idSet.has(m.messageId) || m.messageId < minId)
    // 被撤回的消息如果正被某条消息引用，引用块也一起去掉
    for (const m of messages.value) {
      if (m.replyTo && m.replyTo.messageId >= minId && !idSet.has(m.replyTo.messageId)) {
        m.replyTo = null
      }
    }
    // 选中的消息被撤回后从选择里去掉，选空了就退出选择模式
    if (selecting.value) {
      const alive = new Set(messages.value.map(m => m.messageId))
      const pruned = new Set([...selectedIds.value].filter(id => alive.has(id)))
      selectedIds.value = pruned
      if (!pruned.size) {
        exitSelectMode()
      }
    }
  }
  if (list && list.length) {
    const existing = new Set(messages.value.map(m => m.messageId))
    const fresh = list.filter(m => !existing.has(m.messageId))
    if (fresh.length) {
      messages.value = [...messages.value, ...fresh]
    }
  }
  // 增量刷新（新消息 + 撤回过滤）完成后写回缓存，下次进对话直接画
  dmStore.cacheMessages(currentFriend.value.userId, messages.value)
}

async function loadMore() {
  msgPage.value++
  await loadMessages(false, false)
}

function isNearBottom() {
  const wrap = msgScrollRef.value?.$el?.querySelector('.el-scrollbar__wrap')
  if (!wrap) return true
  return wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 80
}

function toggleEmoji() {
  const nearBottom = isNearBottom()
  emojiShow.value = !emojiShow.value
  if (nearBottom) {
    scrollToBottom()
  }
}

function onInputFocus() {
  // 手机键盘弹起约 300ms 后把最后一条消息滚到可见位置
  setTimeout(() => {
    if (currentFriend.value) scrollToBottom()
  }, 350)
}

function updatePageHeight() {
  // 键盘弹起时 .dm-page 跟着可视高度缩：正常情况下 viewport 的 interactive-widget=resizes-content
  // 会让 100dvh 自动缩小，CSS 就够了；旧版浏览器忽略这个设置时 dvh 不变、输入条会被键盘盖住，
  // 这里用 visualViewport 的真实可视高度直接定死 .dm-page 高度，输入条就贴在键盘上方。
  // 键盘收起后可视高度恢复，改回 null 用 CSS。
  if (!window.visualViewport || window.innerWidth >= 768) {
    kbPageHeight.value = null
    return
  }
  const gap = window.innerHeight - window.visualViewport.height
  if (gap > 120) {
    // 键盘弹起时顶栏已经跟着滚出可视区了，不再占地方：高度只减 --safe-top，
    // 再减顶栏那 60px，会在输入条和键盘之间留一段空白
    const safeTop = parseFloat(getComputedStyle(dmPageRef.value).getPropertyValue('--safe-top')) || 0
    kbPageHeight.value = Math.max(200, Math.round(window.visualViewport.height - safeTop))
  } else {
    kbPageHeight.value = null
  }
}

function onViewportResize() {
  updatePageHeight()
  // 键盘弹起/收起导致可视高度变化时，输入框聚焦状态下滚到底
  if (currentFriend.value && inputRef.value?.textarea && document.activeElement === inputRef.value.textarea) {
    scrollToBottom()
  }
}

function insertEmoji(e) {
  const ta = inputRef.value?.textarea
  if (ta) {
    const start = ta.selectionStart ?? inputContent.value.length
    const end = ta.selectionEnd ?? inputContent.value.length
    inputContent.value = inputContent.value.slice(0, start) + e + inputContent.value.slice(end)
    nextTick(() => {
      ta.focus()
      ta.setSelectionRange(start + e.length, start + e.length)
    })
  } else {
    inputContent.value += e
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

async function onImageFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !currentFriend.value || sendLoading.value) return
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
    ElMessage({ message: t('imageInvalidType'), type: 'error', plain: true })
    return
  }
  sendLoading.value = true
  try {
    let dataUrl
    if (file.type === 'image/gif') {
      if (file.size > 1024 * 1024) {
        ElMessage({ message: t('imageTooLarge'), type: 'error', plain: true })
        return
      }
      dataUrl = await readFileAsDataURL(file)
    } else {
      dataUrl = await compressImage(file)
    }
    await sendMessage(currentFriend.value.userId, dataUrl, 1)
    msgPage.value = 1
    await loadMessages(true, true)
    await refreshAll()
  } finally {
    sendLoading.value = false
  }
}

async function doSend() {
  if (editingMessage.value) {
    await doSaveEdit()
    return
  }
  const content = inputContent.value.trim()
  if (!content || !currentFriend.value || sendLoading.value) return
  sendLoading.value = true
  try {
    await sendMessage(currentFriend.value.userId, content, 0, replyTarget.value?.messageId)
    inputContent.value = ''
    replyTarget.value = null
    msgPage.value = 1
    await loadMessages(true, true)
    await refreshAll()
  } finally {
    sendLoading.value = false
  }
}

let pollTimer = null

// 手机端底部导航“私信”：从聊天窗口回到会话列表
watch(() => uiStore.dmListSignal, (n) => {
  if (n > 0) mobileChat.value = false
})
// 同步聊天窗口状态给底部导航 / FAB（聊天窗口内隐藏它们）
watch(mobileChat, (v) => {
  dmStore.inChat = v
})

onMounted(async () => {
  // 缓存优先：先画上次的会话和申请，后台再刷新；只有第一次打开、缓存为空时
  // refreshAll 才会让模板显示“加载中…”
  if (dmStore.conversationsLoaded) {
    conversations.value = dmStore.conversations
    incomingRequests.value = dmStore.incomingRequests
  }
  // 从联系人页点进来的好友：先立刻打开会话，不等后面的刷新；
  // 以前是等 refreshAll 跑完才打开，手机上要等一两秒，看起来就像第一下没点上
  if (dmStore.pendingFriend) {
    const friend = dmStore.pendingFriend
    dmStore.pendingFriend = null
    openConversation(friend).catch(() => {})
  }
  await refreshAll()
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportResize)
  }
  pollTimer = setInterval(async () => {
    if (document.hidden) return
    await refreshAll()
    if (currentFriend.value) {
      const nearBottom = isNearBottom()
      await pollMessages()
      if (nearBottom) {
        scrollToBottom()
      }
    }
  }, 10000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', onViewportResize)
  }
})

defineOptions({
  name: 'dm'
})
</script>

<style scoped lang="scss">
.dm-page {
  height: 100%;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.dm-side {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  gap: 10px;
}

.add-friend {
  display: flex;
  gap: 8px;
}

.search-result,
.request-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-weight: bold;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.result-email {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.section-title {
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 6px;
}

.request-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conversation-list {
  flex: 1;
  min-height: 0;
}

.loading-tip {
  text-align: center;
  padding: 16px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.conversation-item:hover,
.conversation-item.active {
  background: var(--el-fill-color-light);
}

.conv-info {
  flex: 1;
  min-width: 0;
}

.conv-name {
  font-weight: bold;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.conv-last {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.conv-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.conv-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.letter-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 16px;
}

.letter-avatar.small {
  width: 30px;
  height: 30px;
  font-size: 14px;
}

.avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.msg-avatar.letter-avatar {
  font-size: 14px;
}

.friend-avatar {
  cursor: pointer;
  touch-action: manipulation;
}

.avatar-preview-img {
  display: block;
  width: 100%;
  border-radius: 12px;
}

.dm-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.chat-title {
  flex: 1;
  min-width: 0;
}

.chat-name {
  font-weight: bold;
}

.more-btn {
  font-size: 20px;
  letter-spacing: 2px;
  padding: 0 4px;
}

.message-list {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 16px;
}

.load-more {
  text-align: center;
  margin-bottom: 8px;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 10px;
}

.message-row.mine {
  justify-content: flex-end;
}

.message-row.selecting {
  position: relative;
  padding-left: 30px;
  cursor: pointer;
  border-radius: 10px;
}

.message-row.selected {
  background: var(--el-fill-color-light);
}

.select-circle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--el-border-color);
  background: var(--el-bg-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  flex-shrink: 0;
}

.select-circle.checked {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.message-body {
  max-width: 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.reply-quote {
  padding: 5px 9px;
  margin-bottom: 5px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 6px;
  font-size: 12px;
  min-width: 0;
}

.message-row.mine .reply-quote {
  background: rgba(64, 158, 255, 0.12);
}

.reply-quote-name {
  font-weight: bold;
  color: var(--el-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.reply-quote-content {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.8;
}

.message-bubble {
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
}

.edited-mark {
  font-size: 11px;
  opacity: 0.65;
  text-align: right;
  margin-top: 2px;
}

.message-row.mine .message-bubble {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.time-label {
  width: 100%;
  text-align: center;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin: 12px 0 8px;
}

.msg-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 10px;
  cursor: pointer;
  object-fit: cover;
}

.select-count {
  background: var(--el-fill-color-light);
  border-radius: 999px;
  padding: 6px 14px;
  font-weight: bold;
  white-space: nowrap;
}

.select-exit {
  font-size: 18px;
  padding: 0 6px;
}

.select-action {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
  color: var(--el-text-color-primary);
}

.select-action:hover {
  background: var(--el-fill-color-light);
}

.select-action.danger {
  color: var(--el-color-danger);
}

.select-actions {
  flex-shrink: 0;
  display: flex;
  gap: 12px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}

.select-action-btn {
  flex: 1;
  height: 44px;
  border-radius: 999px;
  font-size: 15px;
}

.reply-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 8px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
  border-radius: 6px;
  font-size: 13px;
}

.reply-bar-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.reply-bar-title {
  font-weight: bold;
  color: var(--el-color-primary);
}

.forward-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 50vh;
  overflow-y: auto;
}

.forward-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  cursor: pointer;
}

.forward-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.forward-check {
  color: var(--el-color-primary);
  font-weight: bold;
  font-size: 16px;
}

.chat-input {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 16px 10px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}

.emoji-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 2px;
  margin-bottom: 8px;
  max-height: 132px;
  overflow-y: auto;
}

.input-bar {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  border-radius: 24px;
  padding: 4px 4px 4px 6px;
}

.input-bar .el-textarea {
  flex: 1;
  min-width: 0;
}

.input-bar .el-textarea__inner {
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 8px 6px;
  resize: none;
  font-size: 14px;
  line-height: 1.4;
}

.input-bar .el-textarea__inner:focus {
  box-shadow: none;
}

.tool-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  border: none;
  background: transparent;
  border-radius: 50%;
}

.tool-btn:hover {
  background: var(--el-fill-color);
}

.send-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  font-size: 15px;
}

.emoji-panel span {
  font-size: 22px;
  line-height: 1.3;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 6px;
}

.emoji-panel span:hover {
  background: var(--el-fill-color-light);
}

.message-content a,
.reply-quote-content a {
  color: #409eff;
  word-break: break-all;
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}

.back-btn {
  display: none;
}

@media (min-width: 768px) {
  .dm-main {
    max-width: 760px;
    margin-left: auto;
    margin-right: auto;
  }
}

@media (max-width: 767px) {
  .dm-page {
    height: 100%;
    // 手机端顶栏是 50px（60px 是电脑端默认值）：减掉它，输入条正好贴在可视区底部；
    // 全屏/standalone 时顶栏长高了 --safe-top，聊天页也要跟着减掉，否则输入条会被顶出可视区
    height: calc(100dvh - 50px - var(--safe-top, 0px));
  }

  .dm-side {
    width: 100%;
    border-right: none;
    // 全幅列表 + 底部留出悬浮胶囊导航的空位（导航 56px + 底边 12px 再多留 12px），避免最后一行被导航遮住
    padding: 8px 0 calc(80px + env(safe-area-inset-bottom, 0px));
  }

  // Telegram 式加好友搜索框：圆角搜索框
  .add-friend {
    padding: 0 12px;

    :deep(.el-input__wrapper) {
      border-radius: 999px;
      background: var(--el-fill-color-light);
      box-shadow: none;
    }

    :deep(.el-input-group__append) {
      border-radius: 0 999px 999px 0;
      background: var(--el-fill-color-light);
      box-shadow: none;
    }

    .el-button {
      border-radius: 999px;
    }
  }

  // Telegram 式结果行：无边框卡片，改成带底部分隔线的一行
  .search-result,
  .request-item {
    border: none;
    border-bottom: 1px solid var(--el-border-color-lighter);
    border-radius: 0;
    padding: 10px 12px;
    gap: 12px;
  }

  .search-result .avatar-img,
  .search-result .letter-avatar,
  .request-item .avatar-img,
  .request-item .letter-avatar,
  .request-item .letter-avatar.small {
    width: 52px;
    height: 52px;
    font-size: 22px;
  }

  .result-name {
    font-size: 16px;
  }

  .result-email {
    font-size: 14px;
  }

  .section-title {
    padding: 0 16px;
  }

  // Telegram 式会话行：52px 圆头像、名字 16px 加粗、预览 14px、时间 12px
  .conversation-item {
    padding: 10px 12px;
    border-radius: 0;
    gap: 12px;
  }

  .conversation-item .avatar-img,
  .conversation-item .letter-avatar {
    width: 52px;
    height: 52px;
    font-size: 22px;
  }

  .conv-name {
    font-size: 16px;
  }

  .conv-last {
    font-size: 14px;
  }

  .conv-time {
    font-size: 12px;
  }

  // 有未读时时间变蓝（Telegram 样式）
  .conversation-item.has-unread .conv-time {
    color: var(--el-color-primary);
  }

  // 未读数：Telegram 蓝色圆徽章（Element Plus 默认是红色）
  .conv-badge :deep(.el-badge__content) {
    background: var(--el-color-primary);
    border: none;
    border-radius: 10px;
    min-width: 20px;
    height: 20px;
    line-height: 20px;
    font-size: 12px;
    padding: 0 5px;
  }

  .dm-side.side-hidden {
    display: none;
  }

  .dm-main {
    display: none;
    width: 100%;
  }

  .dm-main.main-show {
    display: flex;
  }

  .back-btn {
    display: inline-block;
  }

  .chat-header {
    padding: 10px 12px;
  }

  .message-list {
    padding: 12px 12px 16px;
  }

  .chat-input {
    padding: 8px 12px 10px;
  }

  .message-body {
    max-width: 85%;
  }

  .select-actions {
    padding: 10px 12px 12px;
  }
}
</style>
