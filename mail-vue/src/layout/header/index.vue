<template>
  <div class="header">
    <div class="header-btn">
      <hanburger @click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <div v-perm="'email:send'" class="writer-box">
      <el-button
        class="writer"
        size="default"
        :aria-label="$t('compose')"
        @click="openSend"
      >
        <el-icon :size="23">
          <Icon icon="hugeicons:quill-write-01"/>
        </el-icon>
      </el-button>
    </div>
    <email-search
      v-if="showInboxSearch"
      :store="emailStore"
      :search-options="inboxSearchOptions"
      :class="{ 'account-show': accountPanelShow }"
      @search="returnToList('email')"
      @reset="returnToList('email')"
    />
    <email-search
      v-else-if="showSentSearch"
      :store="sendStore"
      :search-options="sentSearchOptions"
      :class="{ 'account-show': accountPanelShow }"
      @search="returnToList('send')"
      @reset="returnToList('send')"
    />
    <all-email-search
      v-else-if="showAllMailSearch"
      :class="{ 'account-show': accountPanelShow }"
      @search="returnToList('all-email')"
      @reset="returnToList('all-email')"
    />
    <div class="toolbar">
      <el-dropdown
        ref="userDropdownRef"
        trigger="click"
        :teleported="false"
        popper-class="detail-dropdown"
        @visible-change="userCardVisible = $event"
      >
        <div class="avatar">
          <img v-if="userStore.user.avatar" class="avatar-img" :src="userStore.user.avatar" alt="">
          <div v-else class="avatar-text">
            <div>{{ formatName(userStore.user.email) }}</div>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="details-avatar" :title="$t('avatarChange')" @click="avatarInput.click()">
              <img v-if="userStore.user.avatar" :src="userStore.user.avatar" alt="">
              <span v-else>{{ formatName(userStore.user.email) }}</span>
            </div>
            <el-button link size="small" class="avatar-change-btn" @click="avatarInput.click()">{{ $t('avatarChange') }}</el-button>
            <div class="avatar-privacy-tip">{{ $t('avatarPrivacyTip') }}</div>
            <input ref="avatarInput" type="file" accept="image/jpeg,image/png,image/gif" style="display: none" @change="onAvatarFile">
            <div class="user-name">
              {{ userStore.user.name }}
            </div>
            <div class="detail-email" @click="copyEmail(userStore.user.email)">
              {{ userStore.user.email }}
            </div>
            <div class="detail-user-type">
              <el-tag>{{ userStore.user.role.name }}</el-tag>
            </div>
            <div class="action-info">
              <div>
                <span style="margin-right: 10px">{{ $t('sendCount') }}</span>
                <span style="margin-right: 10px">{{ $t('accountCount') }}</span>
              </div>
              <div>
                <div>
                  <span v-if="sendCount" style="margin-right: 5px">{{ sendCount }}</span>
                  <el-tag v-if="!hasPerm('email:send')">{{ sendType }}</el-tag>
                  <el-tag v-else>{{ sendType }}</el-tag>
                </div>
                <div>
                  <el-tag v-if="settingStore.settings.manyEmail || settingStore.settings.addEmail">
                    {{ $t('disabled') }}
                  </el-tag>
                  <span v-else-if="accountCount && hasPerm('account:add')"
                        style="margin-right: 5px">{{ $t('totalUserAccount', {msg: accountCount}) }}</span>
                  <el-tag v-else-if="!accountCount && hasPerm('account:add')">{{ $t('unlimited') }}</el-tag>
                  <el-tag v-else-if="!hasPerm('account:add')">{{ $t('unauthorized') }}</el-tag>
                </div>
              </div>
            </div>
            <div class="logout">
              <el-button type="primary" :loading="logoutLoading" @click="clickLogout">{{ $t('logOut') }}</el-button>
            </div>
          </div>
        </template>
      </el-dropdown>
    </div>
    <el-dialog v-model="cropVisible" :title="t('avatarCrop')" width="340" align-center :close-on-click-modal="false" @closed="onCropClosed">
      <div ref="cropAreaRef" class="crop-area" @pointerdown="onCropPointerDown">
        <img v-if="cropImgUrl" ref="cropImgRef" :src="cropImgUrl" class="crop-img" :style="cropImgStyle" draggable="false" @load="onCropImgLoad">
      </div>
      <div class="crop-zoom">
        <span class="crop-zoom-label">{{ t('avatarCropZoom') }}</span>
        <input type="range" min="1" max="3" step="0.01" v-model.number="cropZoom" class="crop-slider" @input="onCropZoomInput">
      </div>
      <template #footer>
        <el-button @click="cropVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="cropConfirmLoading" @click="confirmCrop">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import router from "@/router";
import hanburger from '@/components/hamburger/index.vue'
import {logout} from "@/request/login.js";
import {setAvatar} from "@/request/my.js";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute} from "vue-router";
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"
import emailSearch from '@/components/email-search/index.vue'
import allEmailSearch from '@/components/all-email-search/index.vue'
import {useEmailStore} from '@/store/email.js'
import {useSendStore} from '@/store/send.js'

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const emailStore = useEmailStore()
const sendStore = useSendStore()
const logoutLoading = ref(false)
const userDropdownRef = ref(null)
const avatarInput = ref(null)
const cropVisible = ref(false)
const cropImgUrl = ref('')
const cropImgRef = ref(null)
const cropAreaRef = ref(null)
const cropZoom = ref(1)
const cropOffset = ref({x: 0, y: 0})
const cropImgSize = ref({w: 0, h: 0})
const cropConfirmLoading = ref(false)
let cropDrag = null
let cropObjectUrl = ''
const userCardVisible = ref(false)
const outsidePointerEvents = ['mousedown', 'pointerup', 'mouseup', 'click', 'pointercancel']
let blockOutsideClick = false
const inboxSearchOptions = computed(() => [
  {label: t('subject'), type: 'subject'},
  {label: t('searchSummaryContent'), type: 'content'},
  {label: t('sender'), type: 'sender'},
  {label: t('searchSenderAddress'), type: 'senderAddress'},
])
const sentSearchOptions = computed(() => [
  {label: t('subject'), type: 'subject'},
  {label: t('searchSummaryContent'), type: 'content'},
  {label: t('searchRecipientAddress'), type: 'recipientAddress'},
])
const accountPanelShow = computed(() => uiStore.accountShow && hasPerm('account:query'))
const showInboxSearch = computed(() =>
  route.meta.name === 'email' || isMailboxDetail('inbox')
)
const showSentSearch = computed(() =>
  route.meta.name === 'send' || isMailboxDetail('sent')
)
const showAllMailSearch = computed(() =>
  route.meta.name === 'all-email' || isMailboxDetail('all-mail')
)

function isMailboxDetail(mailbox) {
  return route.meta.name === 'content' && route.params.mailbox === mailbox
}

function returnToList(listName) {
  if (route.meta.name !== 'content') return
  router.push({name: listName})
}

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userStore.user.role.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (userStore.user.role.sendType === 'internal') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
})

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function changeLang(lang) {
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
}

function openSend() {
  uiStore.writerRef.open()
}

function changeAside() {
  uiStore.asideShow = !uiStore.asideShow
}

function clickLogout() {
  logoutLoading.value = true
  logout().then(() => {
    localStorage.removeItem("token")
    router.replace('/login')
  }).finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email[0]?.toUpperCase() || ''
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 裁剪框里看到的正方形，就是最终头像的范围：图片按缩放比例显示，
// 居中后再按 cropOffset 平移；确认时把框内区域画到 512×512 的 canvas 上
const cropImgStyle = computed(() => {
  const area = cropAreaRef.value?.clientWidth || 280
  const {w, h} = cropImgSize.value
  if (!w || !h) return {}
  const k = cropZoom.value * (area / Math.min(w, h))
  return {
    width: w * k + 'px',
    height: h * k + 'px',
    transform: `translate(-50%, -50%) translate(${cropOffset.value.x}px, ${cropOffset.value.y}px)`
  }
})

function clampCropOffset() {
  const area = cropAreaRef.value?.clientWidth || 280
  const {w, h} = cropImgSize.value
  if (!w || !h) return
  const k = cropZoom.value * (area / Math.min(w, h))
  const maxX = Math.max(0, (w * k - area) / 2)
  const maxY = Math.max(0, (h * k - area) / 2)
  cropOffset.value.x = Math.min(maxX, Math.max(-maxX, cropOffset.value.x))
  cropOffset.value.y = Math.min(maxY, Math.max(-maxY, cropOffset.value.y))
}

function onCropImgLoad() {
  const img = cropImgRef.value
  if (!img) return
  cropImgSize.value = {w: img.naturalWidth, h: img.naturalHeight}
  cropZoom.value = 1
  cropOffset.value = {x: 0, y: 0}
}

function onCropZoomInput() {
  clampCropOffset()
}

function onCropPointerDown(event) {
  if (!cropImgUrl.value) return
  event.preventDefault()
  cropDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: cropOffset.value.x,
    offsetY: cropOffset.value.y
  }
  window.addEventListener('pointermove', onCropPointerMove)
  window.addEventListener('pointerup', onCropPointerUp)
  window.addEventListener('pointercancel', onCropPointerUp)
}

function onCropPointerMove(event) {
  if (!cropDrag || event.pointerId !== cropDrag.pointerId) return
  cropOffset.value.x = cropDrag.offsetX + (event.clientX - cropDrag.startX)
  cropOffset.value.y = cropDrag.offsetY + (event.clientY - cropDrag.startY)
  clampCropOffset()
}

function onCropPointerUp() {
  cropDrag = null
  window.removeEventListener('pointermove', onCropPointerMove)
  window.removeEventListener('pointerup', onCropPointerUp)
  window.removeEventListener('pointercancel', onCropPointerUp)
}

function onCropClosed() {
  if (cropObjectUrl) {
    URL.revokeObjectURL(cropObjectUrl)
    cropObjectUrl = ''
  }
  cropImgUrl.value = ''
  cropDrag = null
  window.removeEventListener('pointermove', onCropPointerMove)
  window.removeEventListener('pointerup', onCropPointerUp)
  window.removeEventListener('pointercancel', onCropPointerUp)
}

function confirmCrop() {
  const img = cropImgRef.value
  const area = cropAreaRef.value?.clientWidth || 280
  const {w, h} = cropImgSize.value
  if (!img || !w || !h) return
  const k = cropZoom.value * (area / Math.min(w, h))
  const x0 = (area - w * k) / 2 + cropOffset.value.x
  const y0 = (area - h * k) / 2 + cropOffset.value.y
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  canvas.getContext('2d').drawImage(img, -x0 / k, -y0 / k, area / k, area / k, 0, 0, 512, 512)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  cropConfirmLoading.value = true
  setAvatar(dataUrl).then(() => {
    userStore.user.avatar = dataUrl
    ElMessage({message: t('avatarUpdated'), type: 'success', plain: true})
    cropVisible.value = false
  }).catch(() => {
    // 服务端错误已由请求拦截器提示
  }).finally(() => {
    cropConfirmLoading.value = false
  })
}

function onAvatarFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
    ElMessage({ message: t('avatarInvalidType'), type: 'error', plain: true })
    return
  }
  ;(async () => {
    try {
      let dataUrl
      if (file.type === 'image/gif') {
        // 动图保持原样，只限大小
        if (file.size > 5 * 1024 * 1024) {
          ElMessage({ message: t('avatarTooLarge'), type: 'error', plain: true })
          return
        }
        dataUrl = await readFileAsDataURL(file)
      } else {
        // 静态图：先弹出裁剪框，用户自己选范围再上传；上传在裁剪框点确定时做
        if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl)
        cropObjectUrl = URL.createObjectURL(file)
        cropImgUrl.value = cropObjectUrl
        cropZoom.value = 1
        cropOffset.value = {x: 0, y: 0}
        cropImgSize.value = {w: 0, h: 0}
        cropVisible.value = true
        return
      }
      await setAvatar(dataUrl)
      userStore.user.avatar = dataUrl
      ElMessage({ message: t('avatarUpdated'), type: 'success', plain: true })
    } catch (e) {
      // 服务端错误已由请求拦截器提示
    }
  })()
}

function isInsideUserCard(target) {
  const element = target instanceof Element ? target : target?.parentElement
  if (!(element instanceof Element)) return false
  if (userDropdownRef.value?.$el?.contains(element)) return true
  return !!element.closest('.detail-dropdown')
}

function handleUserCardPointerDown(event) {
  blockOutsideClick = userCardVisible.value && !isInsideUserCard(event.target)
  if (!blockOutsideClick) return

  event.preventDefault()
  event.stopPropagation()
  userDropdownRef.value?.handleClose()
}

function handleUserCardPointerEvent(event) {
  if (!blockOutsideClick) return
  event.preventDefault()
  event.stopPropagation()
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    setTimeout(() => {
      blockOutsideClick = false
    })
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleUserCardPointerDown, true)
  outsidePointerEvents.forEach(type => {
    document.addEventListener(type, handleUserCardPointerEvent, true)
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleUserCardPointerDown, true)
  outsidePointerEvents.forEach(type => {
    document.removeEventListener(type, handleUserCardPointerEvent, true)
  })
})

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 250px;
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;

  .user-name {
    font-weight: bold;
    margin-top: 10px;
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }

  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;

    > div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }

    > div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;

      > div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    color: var(--regular-text-color);
    cursor: pointer;
  }

  .logout {
    margin-top: 20px;
    width: 100%;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 10px;

    .el-button {
      border-radius: 6px;
      height: 28px;
      width: 100%;
    }
  }

  .details-avatar {
    margin-top: 20px;
    height: 40px;
    width: 40px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    border: 1px solid var(--dark-border);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    cursor: pointer;
    overflow: hidden;
    padding: 0;
  }

  .details-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-change-btn {
    margin-top: 4px;
  }

  .avatar-privacy-tip {
    margin-top: 2px;
    padding: 0 16px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    text-align: center;
  }
}


.header {
  text-align: right;
  font-size: 12px;
  display: grid;
  height: 100%;
  gap: 10px;
  grid-template-columns: auto 1fr;
  position: relative;
}

@media (max-width: 767px) {
  .header {
    display: flex;
    align-items: center;
  }

  .header-btn {
    flex: 1;
  }

  .toolbar {
    padding-left: 5px;
    flex-shrink: 0;
  }
}

.writer-box {
  display: none;

  @media (max-width: 767px) {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 0;
    flex-shrink: 0;

    .writer {
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      background: transparent;
      box-shadow: none;
      --el-button-bg-color: transparent;
      --el-button-border-color: transparent;
      --el-button-hover-bg-color: transparent;
      --el-button-hover-border-color: transparent;
      --el-button-active-bg-color: transparent;
      --el-button-active-border-color: transparent;
      --el-button-outline-color: transparent;
    }
  }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.breadcrumb-item {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar {
  display: flex;
  justify-content: end;
  align-items: center;
  gap: 15px;
  @media (max-width: 767px) {
    gap: 10px;
  }

  .icon-item {
    align-self: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-item:hover {
    background: var(--base-fill);
  }

  .avatar {
    display: flex;
    align-items: center;
    cursor: pointer;

    .avatar-img {
      box-sizing: border-box;
      height: 32px;
      width: 32px;
      border-radius: 8px;
      border: 1px solid var(--dark-border);
      object-fit: cover;
    }

    .avatar-text {
      box-sizing: border-box;
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      height: 32px;
      width: 32px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      border: 1px solid var(--dark-border);
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
    }
  }

}

.crop-area {
  position: relative;
  width: min(78vw, 300px);
  aspect-ratio: 1;
  margin: 0 auto;
  overflow: hidden;
  background: #000;
  border-radius: 8px;
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.crop-area:active {
  cursor: grabbing;
}

.crop-img {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: none;
  max-height: none;
  pointer-events: none;
}

.crop-zoom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.crop-zoom-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.crop-slider {
  flex: 1;
  accent-color: var(--el-color-primary);
}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
