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

    <!-- 底部导航：主页 / 联系人 / 厘米FLY / 设置 / 我的 -->
    <nav class="mobile-nav">
      <button class="nav-item" :class="{ active: activeTab === 'email' }" @click="goHome">
        <span class="nav-icon">
          <Icon icon="solar:home-bold" width="24" height="24" />
        </span>
        <span class="nav-label">{{ $t('homeTab') }}</span>
      </button>
      <button class="nav-item" :class="{ active: activeTab === 'contacts' }" @click="goContacts">
        <Icon icon="si:user-alt-2-line" width="24" height="24" />
        <span class="nav-label">{{ $t('contacts') }}</span>
      </button>
      <button class="nav-item" :class="{ active: activeTab === 'race' }" @click="goRace">
        <Icon icon="mdi:run-fast" width="24" height="24" />
        <span class="nav-label">{{ $t('cmfly') }}</span>
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

function goHome() {
  // 第一个 tab 是主页：跳到收件箱（主页路由 /inbox，name 为 'email'）
  if (route.name !== 'email') {
    router.push({ name: 'email' })
  }
}
function goDm() {
  // 右下角 + 菜单里的“发起私信”仍进私信页，/dm 路由保留
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
function goRace() {
  router.push({ name: 'race' })
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

  // 右下角蓝色圆形 + 按钮，浮在悬浮胶囊导航上方（胶囊顶边在 12+56=68px 处，+ 按钮底边在 84px，留 16px 空隙）
  .fab {
    position: fixed;
    right: 16px;
    bottom: calc(84px + env(safe-area-inset-bottom, 0px));
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

  // 底部四个导航：Telegram 式悬浮圆角胶囊——不贴满全宽、不贴底边，
  // 左右各留 16px、底边留 12px（再加手势条安全距离），圆角 28px，带阴影
  .mobile-nav {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    z-index: 300;
    height: 56px;
    border-radius: 28px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
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
