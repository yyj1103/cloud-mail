<template>
  <!-- 手机端底部导航 + 右下角 + 按钮：只在 ≤767px 显示（纯 CSS media query，按屏幕宽度切，不用 User-Agent；窗口拉窄拉宽实时切换，不用刷新）。
       电脑端完全隐藏。私信聊天窗口内也隐藏（dmStore.inChat）。 -->
  <div class="mobile-chrome" v-show="chromeVisible">
    <!-- 右下角蓝色圆形 + 按钮 -->
    <el-dropdown trigger="click" placement="top-end" @command="handleFabCommand">
      <button class="fab" :aria-label="$t('compose')">
        <Icon icon="mdi:plus" width="28" height="28" />
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="compose">
            <Icon icon="quill:write" width="16" height="16" />
            <span>{{ $t('compose') }}</span>
          </el-dropdown-item>
          <el-dropdown-item command="dm">
            <Icon icon="solar:chat-line-bold" width="16" height="16" />
            <span>{{ $t('startDm') }}</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 底部四个导航：私信 / 联系人 / 设置 / 我的 -->
    <nav class="mobile-nav">
      <button class="nav-item" :class="{ active: activeTab === 'dm' }" @click="goDm">
        <span class="nav-icon">
          <Icon icon="solar:chat-line-bold" width="24" height="24" />
          <span v-if="dmStore.unread > 0" class="nav-badge">{{ dmStore.unread > 99 ? '99+' : dmStore.unread }}</span>
        </span>
        <span class="nav-label">{{ $t('dm') }}</span>
      </button>
      <button class="nav-item" :class="{ active: activeTab === 'contacts' }" @click="goContacts">
        <Icon icon="si:user-alt-2-line" width="24" height="24" />
        <span class="nav-label">{{ $t('contacts') }}</span>
      </button>
      <button class="nav-item" :class="{ active: activeTab === 'setting' }" @click="goSetting">
        <Icon icon="fluent:settings-48-regular" width="24" height="24" />
        <span class="nav-label">{{ $t('settings') }}</span>
      </button>
      <button class="nav-item" @click="goMe">
        <span class="nav-avatar">
          <img v-if="userStore.user.avatar" :src="userStore.user.avatar" alt="" />
          <span v-else class="nav-avatar-letter">{{ initial }}</span>
        </span>
        <span class="nav-label">{{ $t('myProfile') }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useDmStore } from '@/store/dm.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'

const route = useRoute()
const router = useRouter()
const dmStore = useDmStore()
const uiStore = useUiStore()
const userStore = useUserStore()

const activeTab = computed(() => route.meta?.name || '')
// 私信聊天窗口内隐藏整条底部导航 + FAB；其余手机页面都显示
const chromeVisible = computed(() => !(route.name === 'dm' && dmStore.inChat))
const initial = computed(() => (userStore.user?.name || userStore.user?.email || '我').charAt(0).toUpperCase())

function goDm() {
  if (route.name === 'dm') {
    // 已在私信页：回到会话列表
    uiStore.dmListSignal++
  } else {
    router.push({ name: 'dm' })
  }
}
function goContacts() {
  router.push({ name: 'contacts' })
}
function goSetting() {
  router.push({ name: 'setting' })
}
function goMe() {
  // 打开右上角现有的头像/账号卡
  uiStore.userCardSignal++
}
function handleFabCommand(cmd) {
  if (cmd === 'compose') {
    uiStore.writerRef?.open()
  } else if (cmd === 'dm') {
    goDm()
  }
}
</script>

<style scoped lang="scss">
// 默认（电脑端）不显示
.mobile-chrome {
  display: none;
}

@media (max-width: 767px) {
  .mobile-chrome {
    display: block;
  }

  // 右下角蓝色圆形 + 按钮，浮在底部导航上方
  .fab {
    position: fixed;
    right: 16px;
    bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
    z-index: 300;
    width: 56px;
    height: 56px;
    border: none;
    border-radius: 50%;
    background: var(--el-color-primary);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  // 底部四个导航
  .mobile-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 300;
    height: calc(56px + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--el-bg-color);
    border-top: 1px solid var(--el-border-color-lighter);
    display: flex;
    box-sizing: border-box;
  }

  .nav-item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--el-text-color-secondary);

    &.active {
      color: var(--el-color-primary);
    }
  }

  .nav-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
  }

  // 未读数：Telegram 蓝色圆徽章
  .nav-badge {
    position: absolute;
    top: -5px;
    right: -10px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    box-sizing: border-box;
  }

  .nav-label {
    font-size: 11px;
    line-height: 1;
  }

  .nav-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .nav-avatar-letter {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--el-color-primary-light-7);
    color: var(--el-color-primary);
    font-size: 13px;
    font-weight: bold;
  }
}
</style>
