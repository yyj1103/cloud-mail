// “添加到主屏幕”安装事件：beforeinstallprompt 只在页面载入后不久触发一次，
// 必须在应用启动时（main.js）就监听存下来；等用户晚点打开设置页时再监听就错过了。
import { ref } from 'vue'

export const deferredPrompt = ref(null)
export const isInstalled = ref(isStandalone())

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

// 是否谷歌浏览器：UA 带 Chrome/CriOS，且不是 Edge、Opera、三星、UC、Vivo 等套壳浏览器
export function isChrome() {
  const ua = window.navigator.userAgent
  return /Chrome\/\d|CriOS\/\d/i.test(ua) && !/Edg\/|EdgA\/|OPR\/|SamsungBrowser\/|YaBrowser\/|UCBrowser\/|VivoBrowser\/|HeyTapBrowser\/|MiuiBrowser\//i.test(ua)
}

export function initInstallPromptListener() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt.value = e
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null
    isInstalled.value = true
  })
}

// 有原生安装事件时弹出安装框，返回 'accepted' / 'dismissed'；没有则返回 null
export async function promptInstall() {
  const promptEvent = deferredPrompt.value
  if (!promptEvent) return null
  promptEvent.prompt()
  const choice = await promptEvent.userChoice
  deferredPrompt.value = null
  if (choice?.outcome === 'accepted') isInstalled.value = true
  return choice?.outcome
}
