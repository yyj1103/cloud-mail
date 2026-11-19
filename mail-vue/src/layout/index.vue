<template>
  <el-container class="layout">
    <el-aside
        class="aside"
        :class="uiStore.asideShow ? 'aside-show' : 'el-aside-hide'">
      <Aside />
    </el-aside>
    <div
        :class="(uiStore.asideShow && isMobile)? 'overlay-show':'overlay-hide'"
        @click="uiStore.asideShow = false"
    ></div>
    <el-container class="main-container" :class="{ 'no-bottom-pad': isDmChat }">
      <el-main>
        <el-header>
            <Header />
        </el-header>
        <Main />
        <div class="site-footer" v-if="showFooter">
                    <div>七玄仙尊 © 2026. All Rights Reserved.</div>
                    <div>作者博客：<a href="https://blog.qixuan.ccwu.cc" target="_blank">blog.qixuan.ccwu.cc</a><span class="footer-sep">·</span>【合作联络】QQ：2384726093</div>
        </div>
      </el-main>
    </el-container>
  </el-container>
  <!-- 手机端底部导航 + 右下角 + 按钮（只在 ≤767px 显示，见 bottom-nav/index.vue） -->
  <bottom-nav />
  <writer ref="writerRef" />
</template>

<script setup>
import Aside from '@/layout/aside/index.vue'
import Header from '@/layout/header/index.vue'
import Main from '@/layout/main/index.vue'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import {useUiStore} from "@/store/ui.js";
import { useDmStore } from "@/store/dm.js";
import writer from '@/layout/write/index.vue'
import BottomNav from '@/layout/bottom-nav/index.vue'

const uiStore = useUiStore();
const route = useRoute();
const dmStore = useDmStore();
// 私信聊天窗口内：底部胶囊导航是隐藏的，内容区不用留它的空位
const isDmChat = computed(() => route.path.startsWith('/dm') && dmStore.inChat)
// 私信页（/dm）不显示站点页脚：对话页里页脚会和输入条下的发图隐私说明挤在一起重叠；
// 邮件列表页（收件箱/星标/已发送/全部邮件/草稿）也不显示布局里的页脚：
// 页脚由列表组件放在滚动内容最后（见 components/email-scroll/index.vue），滑到底才出现
const mailListPaths = ['/inbox', '/starred', '/sent', '/all-mail', '/drafts']
const showFooter = computed(() => !route.path.startsWith('/dm') && !mailListPaths.includes(route.path))
const writerRef = ref({})
const isMobile = ref(window.innerWidth < 1025)
const handleResize = () => {
  isMobile.value = window.innerWidth < 1025
  uiStore.asideShow = window.innerWidth > 1024;
}

onMounted(() => {
  uiStore.writerRef = writerRef

  window.addEventListener('resize', handleResize)
  handleResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style lang="scss" scoped>
.el-aside-hide {
  position: fixed;
  left: 0;
  height: 100%;
  z-index: 100;
  transform: translateX(-100%);
  transition: all 100ms ease;
}

.aside-show {
  -webkit-box-shadow: var(--aside-right-border);
  box-shadow: var(--aside-right-border);
  transform: translateX(0);
  transition: all 100ms ease;
  z-index: 101;
  @media (max-width: 1025px) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 101;
    height: 100%;
    background: var(--el-bg-color);
  }
}

.el-aside {
  width: auto;
  transition: all 100ms ease;
}

.layout {
  height: 100%;
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  overflow: hidden;
  // 顶栏安全区高度（手机状态栏）：只在全屏（Fullscreen API）或主屏幕打开（standalone）时
  // 取 env 值；普通浏览器模式下 display-mode 不匹配，--safe-top 保持 0，不会多出空白。
  // 子孙元素（顶栏、私信页）继承这个变量。
  --safe-top: 0px;
  @media (display-mode: fullscreen), (display-mode: standalone) {
    --safe-top: env(safe-area-inset-top, 0px);
  }
}

.main-container {
  min-height: 100%;
  background: var(--el-bg-color);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  // 手机端：底部导航是悬浮胶囊（56px 高 + 底边留 12px），内容底部留出空位，
  // 56 + 12 再多留 12px，避免最后一行被导航遮住
  @media (max-width: 767px) {
    padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
  }
}

// 私信聊天窗口内不留底部导航的空位：底部胶囊导航在聊天窗口内是隐藏的，
// 留着 80px 会变成输入条下面的一大段空白（键盘弹起时顶栏滚出去了，空白更明显）
.main-container.no-bottom-pad {
  @media (max-width: 767px) {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}

.el-main {
  padding: 0;
}

.el-header {
  background: var(--el-bg-color);
  border-bottom: solid 1px var(--el-border-color);
  padding: 0 0 0 0;
  @media (max-width: 767px) {
    height: 50px;
  }
  // 全屏或主屏幕打开时页面顶到屏幕最顶上，状态栏会盖住顶栏：
  // 顶栏往下顶出状态栏的高度（内容区仍是 50px，border-box 下 padding 不撑高内容）；
  // 普通浏览器模式下 display-mode 不匹配，不会多出空白。
  @media (max-width: 767px) and (display-mode: fullscreen), (max-width: 767px) and (display-mode: standalone) {
    height: calc(50px + var(--safe-top));
    padding-top: var(--safe-top);
    box-sizing: border-box;
  }
}

.overlay-show {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  transition: all 0.3s;
}

.overlay-hide {
  display: flex;
  pointer-events: none;
  opacity: 0;
}

  .site-footer {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

  .site-footer a {
  color: var(--el-color-primary);
  text-decoration: none;
}

  .footer-sep {
  margin: 0 8px;
}
</style>
