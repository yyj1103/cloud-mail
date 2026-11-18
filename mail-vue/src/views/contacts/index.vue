<template>
  <!-- 联系人页：Telegram 式的一行行（圆头像、名字加粗、下面一行是邮箱）；
       加好友用 Telegram 式搜索框 + 结果行；点联系人进私信。
       取数逻辑与私信页完全一致（searchUser / listFriends / listFriendRequests），只改样子。 -->
  <div class="contacts-page">
    <div class="contacts-col">
      <!-- 加好友 -->
      <div class="add-friend">
        <div class="search-row">
          <el-input
            v-model="searchKeyword"
            :placeholder="t('dmSearchPlaceholder')"
            clearable
            class="search-input"
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <Icon icon="ic:round-search" width="18" height="18" />
            </template>
            <!-- 本站后缀写死、一直显示：加好友只能搜本站邮箱 -->
            <template #append>@qixuan.ccwu.cc</template>
          </el-input>
          <el-button type="primary" :loading="searching" @click="handleSearch">{{ t('search') }}</el-button>
        </div>
        <div v-if="searchResult" class="result-row" @click="handleAddFriend">
          <el-avatar :size="52" :src="searchResult.avatar || undefined" class="row-avatar">{{ avatarText(searchResult) }}</el-avatar>
          <div class="row-main">
            <div class="row-name">{{ searchResult.name || searchResult.email }}</div>
            <div class="row-sub">{{ searchResult.email }}</div>
          </div>
          <span class="row-action" :class="{ sent: searchStatus !== 'none' }">{{ addFriendLabel }}</span>
        </div>
      </div>

      <!-- 好友申请 -->
      <div v-if="incomingRequests.length" class="section">
        <div class="section-title">{{ t('dmFriendRequests') }}</div>
        <div v-for="req in incomingRequests" :key="req.friendId" class="result-row">
          <el-avatar :size="52" :src="req.avatar || undefined" class="row-avatar">{{ avatarText(req) }}</el-avatar>
          <div class="row-main">
            <div class="row-name">{{ req.name || req.email }}</div>
            <div class="row-sub">{{ req.email }}</div>
          </div>
          <div class="request-actions">
            <el-button size="small" type="primary" @click="respond(req.friendId, true)">{{ t('dmAccept') }}</el-button>
            <el-button size="small" @click="respond(req.friendId, false)">{{ t('dmReject') }}</el-button>
          </div>
        </div>
      </div>

      <!-- 联系人列表 -->
      <div class="section">
        <div class="section-title">{{ t('dmFriends') }}</div>
        <div v-if="loading" class="empty">{{ t('dmLoading') }}</div>
        <div v-else-if="!friends.length" class="empty">{{ t('dmNoFriends') }}</div>
        <div v-else>
          <div v-for="f in friends" :key="f.userId" class="result-row" @click="openDm(f)">
            <el-avatar :size="52" :src="f.avatar || undefined" class="row-avatar">{{ avatarText(f) }}</el-avatar>
            <div class="row-main">
              <div class="row-name">{{ f.name || f.email }}</div>
              <div class="row-sub">{{ f.email }}</div>
            </div>
            <Icon icon="material-symbols-light:arrow-forward-ios" width="16" height="16" class="row-chevron" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { searchUser, sendFriendRequest, respondFriendRequest } from '@/request/dm.js'
import { useDmStore } from '@/store/dm.js'

const { t } = useI18n()
const router = useRouter()
const dmStore = useDmStore()

const searchKeyword = ref('')
const searching = ref(false)
const searchResult = ref(null)
// none：可添加；sent：已发送请求；friend：已是好友
const searchStatus = ref('none')
// 好友和好友申请缓存在 dm store 里：离开页面不清空，再进页先画缓存、后台悄悄刷新
const incomingRequests = computed(() => dmStore.incomingRequests)
const friends = computed(() => dmStore.friends)
const loading = ref(false)

const addFriendLabel = computed(() => {
  if (searchStatus.value === 'sent') return t('dmRequestSent')
  if (searchStatus.value === 'friend') return t('dmAlreadyFriend')
  return t('dmAddFriend')
})

// 本站域名写死：加好友只能搜本站邮箱，不能按用户名（昵称/显示名）搜
const SITE_DOMAIN = 'qixuan.ccwu.cc'

function avatarText(user) {
  return (user.name || user.email || '?').charAt(0).toUpperCase()
}

// 只收 @ 前面的用户名部分，一定补上写死的本站后缀；
// 输了外站完整邮箱时返回 null，由调用方提示“只能搜索本站邮箱”
function normalizeEmail(input) {
  const keyword = input.trim()
  if (!keyword) return ''
  if (!keyword.includes('@')) return keyword + '@' + SITE_DOMAIN
  const [local, domain] = keyword.split('@')
  if ((domain || '').trim().toLowerCase() !== SITE_DOMAIN) return null
  const name = (local || '').trim()
  return name ? name + '@' + SITE_DOMAIN : ''
}

async function handleSearch() {
  const email = normalizeEmail(searchKeyword.value)
  if (email === null) {
    ElMessage({ message: t('dmOnlySiteEmail'), type: 'warning', plain: true })
    return
  }
  if (!email) return
  searching.value = true
  searchResult.value = null
  searchStatus.value = 'none'
  try {
    const user = await searchUser(email)
    searchResult.value = user
    searchStatus.value = user.isFriend ? 'friend' : 'none'
  } catch (e) {
    // 查无此人：后端报错已由请求拦截器提示
  } finally {
    searching.value = false
  }
}

async function handleAddFriend() {
  if (!searchResult.value || searchStatus.value !== 'none') return
  try {
    await sendFriendRequest(searchResult.value.email)
    searchStatus.value = 'sent'
    ElMessage({ message: t('dmRequestSentMsg'), type: 'success', plain: true })
  } catch (e) {
    // 服务端错误已由请求拦截器提示
  }
}

async function respond(friendId, accept) {
  try {
    await respondFriendRequest(friendId, accept)
    await loadRequests()
    if (accept) await loadFriends()
  } catch (e) {
    // 服务端错误已由请求拦截器提示
  }
}

async function loadRequests() {
  try {
    await dmStore.loadRequests()
  } catch (e) {
    // 服务端错误已由请求拦截器提示
  }
}

async function loadFriends() {
  if (dmStore.friendsLoaded) {
    // 有缓存：页面已经画出上次的好友了，后台悄悄刷新，不显示“加载中…”；
    // 调用方 await 时等刷新完成再返回（比如通过好友申请后要立刻看到新好友）
    return dmStore.loadFriends().catch(() => {})
  }
  // 只有第一次打开、缓存为空时才显示“加载中…”
  loading.value = true
  try {
    await dmStore.loadFriends()
  } catch (e) {
    // 服务端错误已由请求拦截器提示
  } finally {
    loading.value = false
  }
}

function openDm(friend) {
  dmStore.pendingFriend = friend
  router.push({ name: 'dm' })
}

onMounted(() => {
  loadRequests()
  loadFriends()
})
</script>

<style scoped lang="scss">
.contacts-page {
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--el-bg-color);
}

.contacts-col {
  max-width: 760px;
  margin: 0 auto;
  padding: 12px 12px 24px;

  @media (max-width: 767px) {
    padding: 8px 0 76px;
  }
}

.add-friend {
  padding: 0 4px;

  @media (max-width: 767px) {
    padding: 0 12px;
  }
}

.search-row {
  display: flex;
  gap: 8px;
  align-items: center;

  // Telegram 式圆角搜索框
  :deep(.search-input .el-input__wrapper) {
    border-radius: 999px;
    background: var(--el-fill-color-light);
    box-shadow: none;
  }

  // 带 @后缀时：后缀接在输入框右边，右圆角、和输入框同底色（和私信页一致）
  :deep(.search-input .el-input-group__append) {
    border-radius: 0 999px 999px 0;
    background: var(--el-fill-color-light);
    box-shadow: none;
  }
}

.section {
  margin-top: 20px;
}

.section-title {
  padding: 0 4px 6px;
  font-size: 13px;
  font-weight: bold;
  color: var(--el-text-color-secondary);

  @media (max-width: 767px) {
    padding: 0 16px 6px;
  }
}

// Telegram 式的一行：圆头像、名字加粗、下面一行是邮箱/预览
.result-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 767px) {
    padding: 10px 12px;
  }
}

.row-avatar {
  flex-shrink: 0;
  background: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
  font-size: 20px;
  font-weight: bold;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-name {
  font-size: 16px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-sub {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-action {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--el-color-primary);

  &.sent {
    color: var(--el-text-color-secondary);
  }
}

.request-actions {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}

.row-chevron {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}

.empty {
  padding: 24px 4px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
