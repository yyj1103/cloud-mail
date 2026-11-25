<template>
  <!-- 钢铁黎明：单人即时战略（打 AI），游戏本体是独立单文件，用 iframe 嵌进来；
       路由 meta.fullscreen 让布局只显示游戏界面，不显示顶栏、侧栏、底部导航、页脚 -->
  <div class="ra-page">
    <button class="exit-btn" type="button" @click="exitGame" aria-label="close">✕</button>
    <iframe class="ra-frame" src="/games/steel-dawn/index.html" title="钢铁黎明" allow="autoplay" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function exitGame() {
  // 从哪里进来就回哪里；没有历史记录就回私信页（游戏入口在私信 + 号菜单）
  if (window.history.length > 1) router.back()
  else router.push({ name: 'dm' })
}
</script>

<style scoped>
.ra-page {
  height: 100dvh;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: #0a0a0a;
}
.ra-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
.exit-btn {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top, 0px));
  right: 12px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  z-index: 50;
}
</style>
