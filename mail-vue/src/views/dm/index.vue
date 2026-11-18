<template>
  <div class="dm-page">
    <div class="dm-side" :class="{ 'side-hidden': mobileChat }">
      <div class="add-friend">
        <el-input
            v-model="searchEmail"
            :placeholder="$t('dmSearchPlaceholder')"
            @keyup.enter="doSearch"
            clearable
        >
          <template v-if="!searchEmail.includes('@')" #append>@{{ mailDomain }}</template>
        </el-input>
        <el-button type="primary" :loading="searchLoading" @click="doSearch">{{ $t('search') }}</el-button>
      </div>
      <div v-if="searchResult" class="search-result">
        <img v-if="searchResult.avatar" class="avatar-img" :src="searchResult.avatar" alt="">
        <div v-else class="letter-avatar">{{ formatName(searchResult.name || searchResult.email) }}</div>
        <div class="result-info">
          <div class="result-name">{{ searchResult.name }}</div>
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
        <div
            v-for="conv in conversations"
            :key="conv.userId"
            class="conversation-item"
            :class="{ active: currentFriend && currentFriend.userId === conv.userId }"
            @click="openConversation(conv)"
        >
          <img v-if="conv.avatar" class="avatar-img" :src="conv.avatar" alt="">
          <div v-else class="letter-avatar">{{ formatName(conv.name || conv.email) }}</div>
          <div class="conv-info">
            <div class="conv-name">{{ conv.name }}</div>
            <div class="conv-last">{{ conv.lastMessage ? (conv.lastMessage.type === 1 ? $t('dmImageMsg') : conv.lastMessage.content) : conv.email }}</div>
          </div>
          <div class="conv-right">
            <span v-if="conv.lastMessage" class="conv-time">{{ formatTime(conv.lastMessage.createTime) }}</span>
            <el-badge v-if="conv.unread > 0" :value="conv.unread" :max="99" class="conv-badge" />
          </div>
        </div>
        <el-empty v-if="!conversations.length && !incomingRequests.length" :description="$t('dmNoFriends')" />
      </el-scrollbar>
    </div>

    <div class="dm-main" :class="{ 'main-show': mobileChat }">
      <template v-if="currentFriend">
        <div class="chat-header">
          <el-button v-if="isMobile" class="back-btn" link @click="mobileChat = false">&lt; {{ $t('dmFriends') }}</el-button>
          <img v-if="currentFriend.avatar" class="avatar-img" :src="currentFriend.avatar" alt="">
          <div v-else class="letter-avatar">{{ formatName(currentFriend.name || currentFriend.email) }}</div>
          <div class="chat-title">
            <div class="chat-name">{{ currentFriend.name }}</div>
          </div>
          <el-dropdown trigger="click">
            <el-button link class="more-btn">···</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="doRemoveFriend">{{ $t('dmRemoveFriend') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <el-scrollbar ref="msgScrollRef" class="message-list">
          <div v-if="hasMore" class="load-more">
            <el-button link @click="loadMore">{{ $t('dmLoadMore') }}</el-button>
          </div>
          <template v-for="(msg, index) in messages" :key="msg.messageId">
            <div v-if="showTimeLabel(index)" class="time-label">{{ formatTime(msg.createTime) }}</div>
            <div
                class="message-row"
                :class="{ mine: msg.senderUserId === userStore.user.userId }"
            >
              <img v-if="msg.senderUserId !== userStore.user.userId && currentFriend.avatar" class="msg-avatar" :src="currentFriend.avatar" alt="">
              <div v-else-if="msg.senderUserId !== userStore.user.userId" class="msg-avatar letter-avatar">{{ formatName(currentFriend.name || currentFriend.email) }}</div>
              <el-image v-if="msg.type === 1" class="msg-image" :src="msg.content" :preview-src-list="[msg.content]" fit="cover" @contextmenu.prevent="askRecallMessage(msg)" />
              <div v-else class="message-bubble" @contextmenu.prevent="askRecallMessage(msg)">
                <div class="message-content">{{ msg.content }}</div>
              </div>
              <img v-if="msg.senderUserId === userStore.user.userId && userStore.user.avatar" class="msg-avatar" :src="userStore.user.avatar" alt="">
              <div v-else-if="msg.senderUserId === userStore.user.userId" class="msg-avatar letter-avatar">{{ formatName(userStore.user.email) }}</div>
            </div>
          </template>
        </el-scrollbar>
        <div class="chat-input">
          <div class="chat-toolbar">
            <button class="tool-btn" type="button" @click="emojiShow = !emojiShow">😊</button>
            <button class="tool-btn" type="button" @click="imageInput.click()">🖼</button>
            <span class="privacy-tip">{{ $t('dmImagePrivacyTip') }}</span>
            <input ref="imageInput" type="file" accept="image/jpeg,image/png,image/gif,image/webp" style="display: none" @change="onImageFile">
          </div>
          <div v-show="emojiShow" class="emoji-panel">
            <span v-for="e in emojiList" :key="e" @click="insertEmoji(e)">{{ e }}</span>
          </div>
          <div class="input-row">
            <el-input
                ref="inputRef"
                v-model="inputContent"
                type="textarea"
                :rows="2"
                :placeholder="$t('dmTypeMessage')"
                :maxlength="2000"
                @keydown.enter.exact.prevent="doSend"
            />
            <el-button type="primary" :loading="sendLoading" :disabled="!inputContent.trim()" @click="doSend">{{ $t('send') }}</el-button>
          </div>
        </div>
      </template>
      <el-empty v-else :description="$t('dmSelectFriend')" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useI18n } from "vue-i18n";
import { useUserStore } from "@/store/user.js";
import { useDmStore } from "@/store/dm.js";
import { tzDayjs } from "@/utils/day.js";
import {
  searchUser,
  sendFriendRequest,
  listFriendRequests,
  respondFriendRequest,
  removeFriend,
  sendMessage,
  listConversations,
  listMessages,
  deleteMessage
} from "@/request/dm.js";

const { t } = useI18n()
const userStore = useUserStore();
const dmStore = useDmStore();

const searchEmail = ref('')
const searchLoading = ref(false)
const searchResult = ref(null)
const requestLoading = ref(false)
const incomingRequests = ref([])
const conversations = ref([])
const currentFriend = ref(null)
const messages = ref([])
const inputContent = ref('')
const sendLoading = ref(false)
const emojiShow = ref(false)
const inputRef = ref(null)
const imageInput = ref(null)
const emojiList = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '😎', '🤔', '😴', '😭', '😡', '🥺', '😏', '🙂', '😉', '😅', '😢', '😋', '🤗', '😷', '🤢', '🥳', '😤', '🙄', '😬', '🤐', '😳', '🥰', '😇', '🤩', '😈', '👍', '👎', '👏', '🙏', '👌', '✌️', '🤞', '👋', '💪', '🙌', '👀', '💕', '💔', '💯', '🔥', '✨', '🎉', '🎁', '🌹', '🍓', '🍕', '☕', '⚽', '🎮', '🚗', '✈️', '🌙', '⭐', '💤', '❓', '❗']
const msgScrollRef = ref(null)
const msgPage = ref(1)
const hasMore = ref(false)
const mobileChat = ref(false)
const isMobile = computed(() => window.innerWidth < 768)
const mailDomain = computed(() => userStore.user.email?.split('@')[1] || 'qixuan.ccwu.cc')

function normalizeEmail(input) {
  const value = input.trim()
  if (!value) return ''
  if (value.includes('@')) return value
  return value + '@' + mailDomain.value
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

function askRecallMessage(msg) {
  if (msg.senderUserId !== userStore.user.userId) return
  ElMessageBox.confirm(t('dmRecallMessageConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    await deleteMessage(msg.messageId)
    messages.value = messages.value.filter(m => m.messageId !== msg.messageId)
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
  const [convs, reqs] = await Promise.all([
    listConversations().catch(() => []),
    listFriendRequests().catch(() => ({ incoming: [], outgoing: [] }))
  ])
  conversations.value = convs || []
  incomingRequests.value = reqs?.incoming || []
  dmStore.refreshUnread()
}

async function doSearch() {
  const email = normalizeEmail(searchEmail.value)
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

async function doRemoveFriend() {
  if (!currentFriend.value) return
  ElMessageBox.confirm(t('dmRemoveConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    await removeFriend(currentFriend.value.userId)
    currentFriend.value = null
    messages.value = []
    mobileChat.value = false
    await refreshAll()
  })
}

async function openConversation(conv) {
  currentFriend.value = conv
  messages.value = []
  msgPage.value = 1
  hasMore.value = false
  mobileChat.value = true
  await loadMessages(true, true)
}

async function loadMessages(reset, scroll) {
  if (!currentFriend.value) return
  const list = await listMessages(currentFriend.value.userId, msgPage.value, 30)
  if (reset) {
    messages.value = list || []
  } else {
    messages.value = [...(list || []), ...messages.value]
  }
  hasMore.value = (list || []).length >= 30
  if (scroll) {
    scrollToBottom()
  }
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
  const content = inputContent.value.trim()
  if (!content || !currentFriend.value || sendLoading.value) return
  sendLoading.value = true
  try {
    await sendMessage(currentFriend.value.userId, content)
    inputContent.value = ''
    msgPage.value = 1
    await loadMessages(true, true)
    await refreshAll()
  } finally {
    sendLoading.value = false
  }
}

let pollTimer = null

onMounted(async () => {
  await refreshAll()
  pollTimer = setInterval(async () => {
    if (document.hidden) return
    await refreshAll()
    if (currentFriend.value) {
      const nearBottom = isNearBottom()
      await loadMessages(true, false)
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
  padding: 12px 16px;
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

.message-bubble {
  max-width: 70%;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
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

.chat-toolbar {
  display: flex;
  gap: 4px;
  padding: 0 2px 6px;
}

.tool-btn {
  font-size: 20px;
  line-height: 1;
  padding: 4px 6px;
  cursor: pointer;
  border: none;
  background: transparent;
}

.privacy-tip {
  align-self: center;
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.emoji-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 2px 8px;
  max-height: 132px;
  overflow-y: auto;
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

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}

.chat-input {
  display: flex;
  flex-direction: column;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--el-border-color-light);
}

.input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.back-btn {
  display: none;
}

@media (max-width: 767px) {
  .dm-side {
    width: 100%;
    border-right: none;
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

  .message-bubble {
    max-width: 85%;
  }
}
</style>
