<template>
  <div class="race-page">
    <!-- 主页：建房 / 进房 / 单人练习 -->
    <div v-if="screen === 'home'" class="race-home">
      <div class="race-logo">🛷</div>
      <div class="race-title">{{ $t('cmfly') }}</div>
      <p class="race-howto">{{ $t('raceHowTo') }}</p>
      <el-button v-if="dmFriendId" type="primary" size="large" class="home-btn" :loading="busy" @click="doInviteFriend">
        {{ $t('raceInviteFriend') }}
      </el-button>
      <el-button type="primary" size="large" class="home-btn" :loading="busy" @click="doCreate">
        {{ $t('raceCreateRoom') }}
      </el-button>
      <div class="join-row">
        <el-input v-model="joinCode" :placeholder="$t('raceEnterCode')" maxlength="6" clearable
                  @keyup.enter="doJoin" />
        <el-button size="large" :loading="busy" @click="doJoin">{{ $t('raceJoinRoom') }}</el-button>
      </div>
      <el-button size="large" class="home-btn" @click="startPractice">{{ $t('racePractice') }}</el-button>
      <p class="race-desc">{{ $t('racePracticeDesc') }}</p>
    </div>

    <!-- 大厅：房间码 + 邀请 + 选手列表 -->
    <div v-else-if="screen === 'lobby'" class="race-lobby">
      <div class="room-code-label">{{ $t('raceRoomCode') }}</div>
      <div class="room-code">{{ roomCode }}</div>
      <el-button size="large" class="home-btn" @click="copyInvite">{{ $t('raceCopyInvite') }}</el-button>
      <div class="section-title">{{ $t('racePlayers') }} ({{ players.length }})</div>
      <div v-for="p in players" :key="p.userId" class="player-row">
        <el-avatar :size="40" :src="p.avatar || undefined" :style="{ background: colorOf(p.userId) }">
          {{ (p.name || p.email || '?').charAt(0).toUpperCase() }}
        </el-avatar>
        <div class="player-info">
          <div class="player-name">{{ p.name }}<span v-if="p.userId === myId"> ({{ $t('raceYou') }})</span></div>
          <div class="player-sub">{{ p.email }}</div>
        </div>
        <el-tag v-if="p.userId === room?.hostUserId" type="warning" size="small">{{ $t('raceHost') }}</el-tag>
      </div>
      <p v-if="players.length < 2" class="race-desc">{{ $t('raceWaitingPlayers') }}</p>
      <el-button v-if="isHost" type="primary" size="large" class="home-btn" :loading="busy" @click="doStart">
        {{ $t('raceStart') }}
      </el-button>
      <p v-else class="race-desc">{{ $t('raceWaitingHost') }}</p>
      <el-button link @click="doLeave">{{ $t('raceLeave') }}</el-button>
    </div>

    <!-- 比赛：新年夜景坡道（全屏）+ 计时胶囊 + 进度条 + 右侧加速圆钮 -->
    <div v-else-if="screen === 'race'" class="race-track">
      <canvas ref="canvasRef" class="race-canvas" @pointerdown="onBoost" />
      <button class="hud-exit" type="button" @click="exitGame" aria-label="close">✕</button>
      <div class="hud-timer">{{ fmtElapsed }}<span class="hud-score">{{ $t('raceScore') }} {{ me.score }}</span></div>
      <button class="hud-mute" type="button" @click="toggleMute" :aria-label="muted ? 'unmute' : 'mute'">{{ muted ? '🔇' : '🔊' }}</button>
      <button class="boost-circle" type="button" :disabled="countdown > 0 || me.finished"
              @pointerdown.prevent="onBoost" aria-label="boost" />
      <div class="race-progress">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: pct(me.distance) + '%' }" />
          <div v-for="p in standings" :key="p.userId" class="progress-dot"
               :style="{ left: pct(p.distance) + '%', background: colorOf(p.userId) }"
               :title="p.name" />
          <div class="progress-flag">🏁</div>
          <div class="me-bubble" :style="{ left: pct(me.distance) + '%' }">我</div>
        </div>
      </div>
      <div v-if="countdown > 0" class="countdown">{{ countdown }}</div>
      <div v-if="me.finished" class="finish-tip">{{ $t('raceFinished') }}</div>
    </div>

    <!-- 结算：排名 -->
    <div v-else class="race-results">
      <h2>{{ $t('raceRanking') }}</h2>
      <div v-for="(p, i) in results" :key="p.userId" class="result-row">
        <span class="result-rank">{{ i + 1 }}</span>
        <el-avatar :size="40" :src="p.avatar || undefined" :style="{ background: colorOf(p.userId) }">
          {{ (p.name || p.email || '?').charAt(0).toUpperCase() }}
        </el-avatar>
        <div class="player-info">
          <div class="player-name">{{ p.name }}<span v-if="p.userId === myId"> ({{ $t('raceYou') }})</span></div>
          <div class="player-sub">{{ fmtResult(p) }}</div>
        </div>
        <span class="result-score">{{ p.score }}</span>
      </div>
      <el-button type="primary" size="large" class="home-btn" @click="playAgain">
        {{ $t('racePlayAgain') }}
      </el-button>
      <el-button size="large" class="home-btn" @click="backHome">{{ $t('raceBack') }}</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/store/user.js'
import { createRace, joinRace, getRoom, startRace, updateProgress, leaveRace } from '@/request/race.js'
import { sendMessage } from '@/request/dm.js'

// —— 赛道是固定的：所有人跑同一条 1000 米坡道，红包、炮竹和金元宝位置一样 ——
const TRACK = 1000
const RED_PACKETS = [80, 150, 230, 310, 380, 470, 540, 620, 700, 790, 860, 930]
const FIRECRACKERS = [120, 200, 280, 350, 430, 510, 590, 660, 750, 830, 900, 960]
const INGOTS = [60, 180, 260, 340, 420, 500, 580, 680, 760, 840, 920, 980]
const BASE_SPEED = 4      // 不点也会慢慢往下滑
const TAP_ADD = 2.2       // 每点一下加的速度
const MAX_SPEED = 24
const DECAY = 0.55        // 速度向下滑速度回落的快慢
const PACKET_BOOST = 3
const PACKET_SCORE = 100
const CRACKER_SCORE = 50
const INGOT_SCORE = 50
const COLORS = ['#ff5a5a', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899']
const BOT_NAMES = ['阿飞', '小美', '豆豆']

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const screen = ref('home') // home | lobby | race | results
const busy = ref(false)
const joinCode = ref('')
const roomCode = ref('')
const room = ref(null)
const players = ref([])
const trackLength = ref(TRACK)
const countdown = ref(0)
const canvasRef = ref(null)
const results = ref([])
const practiceMode = ref(false)
const muted = ref(false)
const elapsedSec = ref(0)

const myId = computed(() => userStore.user?.userId || 0)
const myName = computed(() => userStore.user?.name || (userStore.user?.email || '').split('@')[0] || '我')
const isHost = computed(() => !!room.value && room.value.hostUserId === myId.value)
// 私信里点 + 进来的：route.query.dm 是好友的 userId，主页会多一个“邀请好友一起跑”
const dmFriendId = computed(() => Number(route.query.dm) || 0)
// 赛场上的所有人：我 + 对手（多人是服务器数据，练习是机器人）
const standings = computed(() => {
  const list = runners.value.map(r => ({
    userId: r.userId, name: r.name, email: r.email || '', avatar: r.avatar || '',
    distance: r.distance, score: r.score, finished: r.finished, finishMs: r.finishMs
  }))
  return list.sort((a, b) => b.distance - a.distance)
})
const me = computed(() => runners.value.find(r => r.userId === myId.value)
  || { userId: myId.value, name: myName.value, distance: 0, score: 0, finished: false })
// 顶上计时胶囊：冲线后停在我自己的完赛用时上
const fmtElapsed = computed(() => {
  const ms = (me.value.finished && me.value.finishMs != null) ? me.value.finishMs : elapsedSec.value * 1000
  return `${(ms / 1000).toFixed(2)}s`
})

// —— 小音效（点加速 / 吃红包 / 踩炮竹 / 冲线），静音钮控制 ——
let audioCtx = null
function tone(freq, dur, type = 'sine', vol = 0.1, delay = 0) {
  if (muted.value) return
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const t0 = audioCtx.currentTime + delay
    const o = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
    o.connect(g)
    g.connect(audioCtx.destination)
    o.start(t0)
    o.stop(t0 + dur)
  } catch (e) { /* 没声音就算了 */ }
}
function playChime() { tone(880, 0.12, 'sine', 0.1); tone(1318, 0.16, 'sine', 0.1, 0.09) }
function playPop() { tone(160, 0.15, 'square', 0.07) }
function toggleMute() { muted.value = !muted.value }

// —— 每个人的跑步状态（我和机器人共用同一套物理） ——
const runners = ref([])
let rafId = 0
let lastTs = 0
let raceStartClient = 0
let firstFinishAt = 0
let lobbyTimer = null
let roomTimer = null
let progressTimer = null
let countdownTimer = null
let resizeObs = null
let lastTick = 0

function colorOf(userId) {
  return COLORS[Math.abs(Number(userId) || 0) % COLORS.length]
}
function pct(d) {
  return Math.max(0, Math.min(100, (d / trackLength.value) * 100))
}
function fmtMs(ms) {
  if (ms == null) return ''
  const s = (ms / 1000).toFixed(1)
  return `${s}s`
}
function fmtResult(p) {
  if (p.finished && p.finishMs != null) return `${t('raceTime')}: ${fmtMs(p.finishMs)}`
  return `${t('raceDistance')}: ${Math.floor(p.distance)}m`
}

function makeRunner(userId, name, avatar, email) {
  return {
    userId, name, avatar: avatar || '', email: email || '',
    distance: 0, speed: 0, score: 0, finished: false, finishMs: null,
    gotPackets: new Set(), hitCrackers: new Set(), gotIngots: new Set(), botTarget: 0, botTimer: 0
  }
}

// —— 房间操作 ——
async function doCreate() {
  busy.value = true
  try {
    const data = await createRace(myName.value)
    roomCode.value = data.code
    trackLength.value = data.trackLength || TRACK
    screen.value = 'lobby'
    startLobbyPoll()
  } finally {
    busy.value = false
  }
}

// 私信 + 进来的邀请：建房 → 把邀请链接发到和好友的私信 → 进大厅等好友点链接加入
async function doInviteFriend() {
  if (!dmFriendId.value) return
  busy.value = true
  try {
    const data = await createRace(myName.value)
    const link = `${location.origin}/race?code=${data.code}`
    await sendMessage(dmFriendId.value, t('raceInviteMsg', { link }))
    ElMessage({ message: t('raceInviteSent'), type: 'success', plain: true })
    roomCode.value = data.code
    trackLength.value = data.trackLength || TRACK
    screen.value = 'lobby'
    startLobbyPoll()
  } finally {
    busy.value = false
  }
}

async function doJoin(code) {
  const c = (code || joinCode.value || '').trim().toUpperCase()
  if (!c) return
  busy.value = true
  try {
    await joinRace(c, myName.value)
    roomCode.value = c
    screen.value = 'lobby'
    startLobbyPoll()
  } catch (e) {
    // 服务端报错已由拦截器提示；房间码不存在时额外给一句中文提示
    if (e && e.code === 404) ElMessage({ message: t('raceRoomNotFound'), type: 'warning', plain: true })
  } finally {
    busy.value = false
  }
}

let roomFailCount = 0
async function refreshRoom() {
  if (!roomCode.value) return null
  try {
    const data = await getRoom(roomCode.value)
    roomFailCount = 0
    room.value = data
    players.value = data.players || []
    trackLength.value = data.trackLength || TRACK
    return data
  } catch (e) {
    // 房间没了（房主解散）：连着两次拿不到就回主页，不一直弹报错
    roomFailCount++
    if (roomFailCount >= 2) roomGone()
    return null
  }
}

function roomGone() {
  stopAllTimers()
  roomCode.value = ''
  room.value = null
  players.value = []
  runners.value = []
  practiceMode.value = false
  screen.value = 'home'
  joinCode.value = ''
  ElMessage({ message: t('raceRoomGone'), type: 'warning', plain: true })
}

function startLobbyPoll() {
  stopLobbyPoll()
  refreshRoom()
  lobbyTimer = setInterval(async () => {
    const data = await refreshRoom()
    if (data && data.status === 'racing') {
      stopLobbyPoll()
      enterRace(false)
    }
  }, 2000)
}
function stopLobbyPoll() {
  if (lobbyTimer) { clearInterval(lobbyTimer); lobbyTimer = null }
}

function copyInvite() {
  const link = `${location.origin}/race?code=${roomCode.value}`
  const done = () => ElMessage({ message: t('raceInviteCopied'), type: 'success', plain: true })
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(done).catch(() => fallbackCopy(link, done))
  } else {
    fallbackCopy(link, done)
  }
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea')
  ta.value = text
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy'); done() } catch (e) { /* 复制失败就不提示 */ }
  document.body.removeChild(ta)
}

async function doStart() {
  if (!isHost.value) return
  busy.value = true
  try {
    await startRace(roomCode.value)
    stopLobbyPoll()
    enterRace(false)
  } finally {
    busy.value = false
  }
}

async function doLeave() {
  stopAllTimers()
  const code = roomCode.value
  roomCode.value = ''
  room.value = null
  players.value = []
  runners.value = []
  if (code && !practiceMode.value) {
    leaveRace(code).catch(() => {})
  }
  practiceMode.value = false
  screen.value = 'home'
  joinCode.value = ''
}

function backHome() {
  doLeave()
}

// 左上角 ✕：先离房（在房间里就退掉房间），再退出游戏回上一页
async function exitGame() {
  if (screen.value !== 'home') await doLeave()
  if (window.history.length > 1) router.back()
  else router.push({ name: 'email' })
}

async function playAgain() {
  // 练习：直接再跑一局；多人：房主建个新房进大厅，客人回主页
  if (practiceMode.value) {
    startPractice()
    return
  }
  const wasHost = isHost.value
  await doLeave()
  if (wasHost) doCreate()
}

// —— 练习模式：3 个机器人陪跑 ——
function startPractice() {
  practiceMode.value = true
  roomCode.value = ''
  trackLength.value = TRACK
  runners.value = [makeRunner(myId.value, myName.value, userStore.user?.avatar, userStore.user?.email)]
  BOT_NAMES.forEach((n, i) => {
    const bot = makeRunner(100000 + i, n, '', '')
    bot.botTarget = 12 + Math.random() * 4
    runners.value.push(bot)
  })
  enterRace(true)
}

// —— 开跑：倒数 3 秒，然后启动循环和轮询 ——
function enterRace(isPractice) {
  practiceMode.value = isPractice
  if (!isPractice) {
    // 多人：按房间里的选手建跑步状态（保留我已跑的进度）
    const old = Object.fromEntries(runners.value.map(r => [r.userId, r]))
    runners.value = (players.value || []).map(p => {
      const r = old[p.userId] || makeRunner(p.userId, p.name, p.avatar, p.email)
      r.name = p.name; r.avatar = p.avatar || ''; r.email = p.email || ''
      r.distance = Math.max(r.distance, p.distance || 0)
      r.score = Math.max(r.score, p.score || 0)
      if (p.finished && !r.finished) { r.finished = true; r.finishMs = p.finishMs }
      return r
    })
    const mine = runners.value.find(r => r.userId === myId.value)
    if (!mine) runners.value.push(makeRunner(myId.value, myName.value, userStore.user?.avatar, userStore.user?.email))
    raceStartClient = (room.value?.startedAt || Date.now())
    firstFinishAt = 0
  } else {
    raceStartClient = Date.now()
    firstFinishAt = 0
  }
  elapsedSec.value = 0
  screen.value = 'race'
  // 倒数：按服务器开跑时间算，晚进房的人直接跳过已过的秒数
  const remain = Math.max(0, 3000 - (Date.now() - raceStartClient))
  countdown.value = Math.ceil(remain / 1000)
  nextTick(() => {
    startLoop()
    if (countdown.value > 0) {
      countdownTimer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) {
          clearInterval(countdownTimer)
          countdownTimer = null
        }
      }, 1000)
    }
    if (!isPractice) {
      progressTimer = setInterval(postProgress, 500)
      roomTimer = setInterval(pollRace, 1000)
    }
  })
}

async function postProgress() {
  const m = runners.value.find(r => r.userId === myId.value)
  if (!m || m.finished) return
  try {
    await updateProgress(roomCode.value, Math.floor(m.distance), m.score, m.finished)
  } catch (e) { /* 掉线就等下次轮询 */ }
}

async function pollRace() {
  const data = await refreshRoom()
  if (!data) return
  if (data.status !== 'racing') return
  for (const p of data.players || []) {
    const r = runners.value.find(x => x.userId === p.userId)
    if (!r) {
      // 中途有人进房（开跑前已在房里的才会有；这里只补漏）
      runners.value.push(makeRunner(p.userId, p.name, p.avatar, p.email))
      continue
    }
    if (r.userId === myId.value) continue
    // 对手位置以服务器为准；分数和完赛状态也同步过来
    r.distance = Math.max(r.distance, p.distance || 0)
    r.score = p.score || 0
    if (p.finished && !r.finished) {
      r.finished = true
      r.finishMs = p.finishMs
      r.speed = 0
    }
  }
  checkFinish()
}

// —— 速度：不点就往 4m/s 回落，点一下 +2.2；红包 +3，炮竹减半 ——
function onBoost() {
  if (screen.value !== 'race' || countdown.value > 0) return
  const m = runners.value.find(r => r.userId === myId.value)
  if (!m || m.finished) return
  m.speed = Math.min(MAX_SPEED, m.speed + TAP_ADD)
  const now = performance.now()
  if (now - lastTick > 90) {
    lastTick = now
    tone(500 + Math.min(400, m.speed * 16), 0.06, 'triangle', 0.05)
  }
}
function onKey(e) {
  if (screen.value !== 'race') return
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault()
    if (!e.repeat) onBoost()
  }
}

function stepRunner(r, dt, now) {
  if (r.finished) return
  if (r.userId === myId.value || !practiceMode.value) {
    // 我：只在倒数结束后跑；多人模式里对手位置由服务器推，我不动他
    if (r.userId !== myId.value) return
    if (countdown.value > 0) { r.speed = 0; return }
    r.speed += (BASE_SPEED - r.speed) * DECAY * dt
  } else {
    // 机器人：目标速度随机游走
    r.botTimer -= dt
    if (r.botTimer <= 0) {
      r.botTimer = 0.4 + Math.random() * 0.6
      r.botTarget = 11 + Math.random() * 6
    }
    r.speed += (r.botTarget - r.speed) * 1.2 * dt
  }
  r.distance += r.speed * dt
  // 红包 / 炮竹 / 金元宝：按固定位置判定，每人各吃各的
  for (const pos of RED_PACKETS) {
    if (r.distance >= pos && !r.gotPackets.has(pos)) {
      r.gotPackets.add(pos)
      r.score += PACKET_SCORE
      r.speed = Math.min(MAX_SPEED, r.speed + PACKET_BOOST)
      if (r.userId === myId.value) {
        ElMessage({ message: t('raceRedPacket'), type: 'success', plain: true, grouping: true })
        playChime()
      }
    }
  }
  for (const pos of FIRECRACKERS) {
    if (r.distance >= pos && !r.hitCrackers.has(pos)) {
      r.hitCrackers.add(pos)
      r.score = Math.max(0, r.score - CRACKER_SCORE)
      r.speed *= 0.5
      if (r.userId === myId.value) {
        ElMessage({ message: t('raceFirecracker'), type: 'warning', plain: true, grouping: true })
        playPop()
      }
    }
  }
  for (const pos of INGOTS) {
    if (r.distance >= pos && !r.gotIngots.has(pos)) {
      r.gotIngots.add(pos)
      r.score += INGOT_SCORE
      if (r.userId === myId.value) {
        ElMessage({ message: t('raceIngot'), type: 'success', plain: true, grouping: true })
        playChime()
      }
    }
  }
  if (r.distance >= trackLength.value) {
    r.distance = trackLength.value
    r.finished = true
    r.speed = 0
    r.finishMs = now - raceStartClient - 3000 // 扣掉 3 秒倒数
    if (r.userId === myId.value) {
      ElMessage({ message: t('raceFinished'), type: 'success', plain: true })
      playChime()
    }
  }
}

function checkFinish() {
  const finished = runners.value.filter(r => r.finished)
  if (!finished.length) return
  if (!firstFinishAt) firstFinishAt = Date.now()
  const allDone = runners.value.length > 0 && finished.length === runners.value.length
  const timeout = Date.now() - firstFinishAt > 30000
  if (allDone || timeout) showResults()
}

function showResults() {
  stopAllTimers()
  const list = runners.value.map(r => ({
    userId: r.userId, name: r.name, email: r.email || '', avatar: r.avatar || '',
    distance: r.distance, score: r.score, finished: r.finished, finishMs: r.finishMs
  }))
  list.sort((a, b) => {
    if (a.finished && b.finished) return (a.finishMs || 0) - (b.finishMs || 0)
    if (a.finished) return -1
    if (b.finished) return 1
    return b.distance - a.distance
  })
  results.value = list
  screen.value = 'results'
}

function stopAllTimers() {
  stopLobbyPoll()
  if (roomTimer) { clearInterval(roomTimer); roomTimer = null }
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
}

// —— 画布：新年夜景 + 橙色波浪坡道（按截图画） ——
// 坡道形状：缓下坡 + 两段起伏，和原版一样，所有人跑同一条坡
function slopeY(d) {
  return 150 + d * 0.06 + 42 * Math.sin(d * 0.02) + 14 * Math.sin(d * 0.053)
}
// 坡道斜率（屏上角度用）
function slopeK(d) {
  return 0.06 + 42 * 0.02 * Math.cos(d * 0.02) + 14 * 0.053 * Math.cos(d * 0.053)
}
// 确定性伪随机：同一位置永远同一种装饰，所有人看到的夜景一样
function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function startLoop() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth || 320
    const h = canvas.clientHeight || 320
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  if (resizeObs) resizeObs.disconnect()
  resizeObs = new ResizeObserver(resize)
  resizeObs.observe(canvas)
  lastTs = performance.now()
  const frame = (ts) => {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016)
    lastTs = ts
    const now = Date.now()
    for (const r of runners.value) stepRunner(r, dt, now)
    if (countdown.value <= 0) elapsedSec.value = Math.max(0, (now - raceStartClient - 3000) / 1000)
    draw(ctx, canvas, ts / 1000)
    checkFinish()
    if (screen.value === 'race') rafId = requestAnimationFrame(frame)
  }
  rafId = requestAnimationFrame(frame)
}

function draw(ctx, canvas, timeSec) {
  const W = canvas.clientWidth || 320
  const H = canvas.clientHeight || 320
  const leader = Math.max(0, ...runners.value.map(r => r.distance))
  const leaderSpeed = Math.max(0, ...runners.value.map(r => r.speed || 0))
  const camX = Math.max(0, leader - 45)
  const pxPerM = W / 150
  const camY = slopeY(Math.max(0, leader)) - H * 0.55
  const toX = d => (d - camX) * pxPerM
  const toY = d => slopeY(d) - camY

  // —— 天空：粉 → 暖橙渐变 ——
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#f6b8c8')
  sky.addColorStop(0.45, '#ffd2a0')
  sky.addColorStop(1, '#ffedb8')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // —— 大月亮（右上）+ 光晕 ——
  const moonR = Math.min(W, H) * 0.13
  const mx = W * 0.8, my = H * 0.13
  const glow = ctx.createRadialGradient(mx, my, moonR * 0.4, mx, my, moonR * 2.2)
  glow.addColorStop(0, 'rgba(255, 248, 220, 0.85)')
  glow.addColorStop(1, 'rgba(255, 248, 220, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(mx, my, moonR * 2.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff8dc'
  ctx.beginPath()
  ctx.arc(mx, my, moonR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(230, 210, 160, 0.5)'
  ctx.beginPath()
  ctx.arc(mx - moonR * 0.3, my - moonR * 0.2, moonR * 0.16, 0, Math.PI * 2)
  ctx.arc(mx + moonR * 0.25, my + moonR * 0.3, moonR * 0.12, 0, Math.PI * 2)
  ctx.fill()

  // —— 星星点点 ——
  for (let i = 0; i < 26; i++) {
    const sx = hash01(i * 3 + 1) * W
    const sy = hash01(i * 3 + 2) * H * 0.4
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(timeSec * 1.5 + i))
    ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * tw})`
    ctx.beginPath()
    ctx.arc(sx, sy, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // —— 烟花（固定几个位置，轮流绽放） ——
  const bursts = [
    { d: 140, y: 0.16, c: ['#ffd76a', '#ff5a8a', '#7ec8ff'] },
    { d: 430, y: 0.2, c: ['#fff3b0', '#ff9a3d', '#c084fc'] },
    { d: 720, y: 0.14, c: ['#ffd76a', '#7ee8a2', '#ff8a80'] },
    { d: 950, y: 0.18, c: ['#fff3b0', '#ff5a8a', '#7ec8ff'] }
  ]
  for (const b of bursts) {
    const bx = toX(b.d)
    if (bx < -80 || bx > W + 80) continue
    const by = H * b.y
    const ph = (timeSec * 0.5 + b.d * 0.01) % 1
    const R = 14 + ph * 46
    const alpha = Math.max(0, 1 - ph)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + b.d
      const rr = R * (0.55 + 0.45 * hash01(i + b.d))
      const px = bx + Math.cos(a) * rr
      const py = by + Math.sin(a) * rr * 0.9
      ctx.fillStyle = b.c[i % b.c.length]
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(px, py, 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // 中心亮点
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = alpha
    ctx.beginPath()
    ctx.arc(bx, by, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // —— 孔明灯（慢慢往上飘） ——
  for (let i = 0; i < 3; i++) {
    const lx = W * (0.18 + i * 0.32) + Math.sin(timeSec * 0.4 + i * 2) * 8
    const ly = H * 0.34 - ((timeSec * 9 + i * 53) % 150)
    if (ly < -20) continue
    ctx.fillStyle = 'rgba(255, 150, 60, 0.9)'
    roundRect(ctx, lx - 7, ly - 9, 14, 18, 4)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 220, 130, 0.95)'
    ctx.fillRect(lx - 3, ly - 4, 6, 8)
  }

  // —— 远处年味小镇剪影（跟坡面走，视差 0.5）：翘檐屋顶 + 红灯笼 + 一串炮竹 ——
  const horizon = (d) => toY(d) - 34
  for (let d = Math.floor(camX / 26) * 26 - 26; d <= camX + 170; d += 26) {
    const x = toX(d)
    if (x < -70 || x > W + 70) continue
    const y = horizon(d)
    const w = 44 + hash01(d) * 18
    const hgt = 22 + hash01(d + 7) * 10
    // 屋身
    ctx.fillStyle = '#5b3a52'
    ctx.fillRect(x - w / 2 + 6, y - hgt + 10, w - 12, hgt)
    // 翘檐屋顶
    ctx.fillStyle = '#6e4660'
    ctx.beginPath()
    ctx.moveTo(x - w / 2 - 4, y - hgt + 12)
    ctx.quadraticCurveTo(x, y - hgt - 12, x + w / 2 + 4, y - hgt + 12)
    ctx.lineTo(x + w / 2 - 2, y - hgt + 18)
    ctx.lineTo(x - w / 2 + 2, y - hgt + 18)
    ctx.closePath()
    ctx.fill()
    // 红灯笼（隔一家挂一盏）
    if (hash01(d + 3) > 0.45) {
      const lx = x + (hash01(d + 5) - 0.5) * w * 0.5
      const lglow = ctx.createRadialGradient(lx, y - 6, 1, lx, y - 6, 14)
      lglow.addColorStop(0, 'rgba(255, 150, 60, 0.8)')
      lglow.addColorStop(1, 'rgba(255, 150, 60, 0)')
      ctx.fillStyle = lglow
      ctx.beginPath()
      ctx.arc(lx, y - 6, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff5a3c'
      ctx.beginPath()
      ctx.ellipse(lx, y - 6, 5, 6.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffd76a'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(lx, y + 1)
      ctx.lineTo(lx, y + 7)
      ctx.stroke()
    }
  }
  // 一串炮竹挂在屋檐下（固定在 300 米处）
  {
    const px = toX(300)
    if (px > -40 && px < W + 40) {
      const py = horizon(300) - 8
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#d63030' : '#b02020'
        roundRect(ctx, px - 5 + (i % 2 ? 3 : -3), py + i * 11, 10, 10, 3)
        ctx.fill()
        ctx.fillStyle = '#ffd76a'
        ctx.fillRect(px - 1 + (i % 2 ? 3 : -3), py + i * 11 + 3, 2, 4)
      }
    }
  }

  // —— 橙色波浪坡道 ——
  ctx.beginPath()
  ctx.moveTo(-10, H + 10)
  for (let d = camX - 10; d <= camX + 160; d += 2) {
    ctx.lineTo(toX(d), toY(d))
  }
  ctx.lineTo(W + 10, H + 10)
  ctx.closePath()
  const gnd = ctx.createLinearGradient(0, H * 0.4, 0, H)
  gnd.addColorStop(0, '#ff9a3d')
  gnd.addColorStop(0.5, '#f96a16')
  gnd.addColorStop(1, '#e8540f')
  ctx.fillStyle = gnd
  ctx.fill()
  // 坡面上的深橙色斑点
  for (let d = Math.floor(camX / 7) * 7; d <= camX + 160; d += 7) {
    if (hash01(d * 1.7) < 0.45) continue
    const x = toX(d)
    const y = toY(d) + 16 + hash01(d * 2.3) * 46
    if (y > H + 6) continue
    ctx.fillStyle = 'rgba(200, 70, 0, 0.28)'
    ctx.beginPath()
    ctx.ellipse(x, y, 4 + hash01(d) * 5, 3 + hash01(d + 9) * 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 坡顶金边（截图里那道亮边）
  ctx.strokeStyle = '#ffd98c'
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let d = camX - 10; d <= camX + 160; d += 2) {
    const x = toX(d), y = toY(d)
    if (d === camX - 10) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 243, 196, 0.9)'
  ctx.lineWidth = 1.6
  ctx.stroke()

  // —— 终点：红底金边拱门 ——
  if (toX(TRACK) >= -60 && toX(TRACK) <= W + 60) {
    const fx = toX(TRACK)
    const fy = toY(TRACK)
    ctx.fillStyle = '#c9a227'
    ctx.fillRect(fx - 34, fy - 66, 5, 66)
    ctx.fillRect(fx + 29, fy - 66, 5, 66)
    ctx.fillStyle = '#e23b3b'
    roundRect(ctx, fx - 34, fy - 66, 68, 26, 4)
    ctx.fill()
    ctx.strokeStyle = '#ffd76a'
    ctx.lineWidth = 2
    roundRect(ctx, fx - 34, fy - 66, 68, 26, 4)
    ctx.stroke()
    ctx.fillStyle = '#ffe9a8'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('终点', fx, fy - 47)
  }

  // —— 红包 / 炮竹 / 金元宝 ——
  for (const pos of RED_PACKETS) {
    const x = toX(pos)
    if (x < -30 || x > W + 30) continue
    const y = toY(pos)
    const bobY = Math.sin(timeSec * 3 + pos) * 2
    ctx.fillStyle = '#e23b3b'
    roundRect(ctx, x - 9, y - 28 + bobY, 18, 22, 4)
    ctx.fill()
    ctx.fillStyle = '#ffd76a'
    ctx.fillRect(x - 9, y - 28 + bobY, 18, 3)
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('¥', x, y - 11 + bobY)
  }
  for (const pos of FIRECRACKERS) {
    const x = toX(pos)
    if (x < -30 || x > W + 30) continue
    const y = toY(pos)
    ctx.fillStyle = '#c0392b'
    roundRect(ctx, x - 6, y - 20, 12, 20, 3)
    ctx.fill()
    ctx.strokeStyle = '#8e44ad'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - 20)
    ctx.quadraticCurveTo(x + 6, y - 28, x + 10, y - 24)
    ctx.stroke()
    ctx.fillStyle = '#ffd76a'
    ctx.beginPath()
    ctx.arc(x + 10, y - 24, 2.5 + Math.sin(timeSec * 8 + pos) * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const pos of INGOTS) {
    const x = toX(pos)
    if (x < -30 || x > W + 30) continue
    const y = toY(pos)
    const bobY = Math.sin(timeSec * 2.4 + pos) * 2
    ctx.fillStyle = '#f7b731'
    ctx.beginPath()
    ctx.ellipse(x, y - 10 + bobY, 13, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffd76a'
    ctx.beginPath()
    ctx.ellipse(x, y - 13 + bobY, 7, 4.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.beginPath()
    ctx.ellipse(x - 4, y - 13 + bobY, 3, 1.6, -0.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // —— 速度线（跑得快时） ——
  if (leaderSpeed > 15) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.lineWidth = 2
    for (let i = 0; i < 5; i++) {
      const sy = H * (0.15 + hash01(i * 11 + Math.floor(timeSec * 3)) * 0.4)
      const sx = W - ((timeSec * 420 + i * 137) % (W + 120)) + 60
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + 46, sy)
      ctx.stroke()
    }
  }

  // —— 滑板小人 ——
  for (const r of runners.value) {
    const x = toX(r.distance)
    if (x < -50 || x > W + 50) continue
    const y = toY(r.distance)
    const isMe = r.userId === myId.value
    const color = colorOf(r.userId)
    const bob = Math.sin(timeSec * (4 + r.speed)) * Math.min(2.5, r.speed * 0.12)
    const ang = Math.atan(slopeK(r.distance) / pxPerM) * 0.7
    // 影子
    ctx.fillStyle = 'rgba(120, 30, 0, 0.25)'
    ctx.beginPath()
    ctx.ellipse(x, y + 3, 14, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.translate(x, y + bob * 0.4)
    ctx.rotate(ang)
    // 滑板
    ctx.fillStyle = '#7c5cff'
    roundRect(ctx, -17, -4, 34, 6, 3)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillRect(-12, -3, 24, 1.6)
    // 腿（蹲姿）
    ctx.strokeStyle = '#2f3a56'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-2, -14)
    ctx.lineTo(-7, -4)
    ctx.moveTo(3, -14)
    ctx.lineTo(8, -4)
    ctx.stroke()
    // 身体（白衣）
    ctx.fillStyle = '#f5f7ff'
    roundRect(ctx, -8, -30, 16, 18, 7)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillRect(-8, -16, 16, 3)
    // 手臂（张开保持平衡）
    ctx.strokeStyle = '#f5f7ff'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(-6, -26)
    ctx.lineTo(-15, -20)
    ctx.moveTo(6, -26)
    ctx.lineTo(15, -22)
    ctx.stroke()
    // 头 + 蓝发
    ctx.fillStyle = '#ffd9b3'
    ctx.beginPath()
    ctx.arc(0, -37, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3aa7ff'
    ctx.beginPath()
    ctx.arc(0, -39, 9, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(-9, -34, 3.5, 0, Math.PI * 2)
    ctx.arc(9, -34, 3.5, 0, Math.PI * 2)
    ctx.fill()
    // 眼睛
    ctx.fillStyle = '#222'
    ctx.beginPath()
    ctx.arc(4, -37, 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // 名字
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = isMe ? '#c0392b' : '#333'
    ctx.fillText(isMe ? `${r.name} (我)` : r.name, x, y - 56 + bob * 0.4)
    if (isMe) {
      ctx.strokeStyle = '#ffd76a'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y - 22, 24, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

onMounted(() => {
  userStore.refreshUserInfo()
  window.addEventListener('keydown', onKey)
  const code = route.query.code
  if (code && typeof code === 'string') {
    joinCode.value = code.toUpperCase()
    doJoin(code)
  }
})

onUnmounted(() => {
  stopAllTimers()
  window.removeEventListener('keydown', onKey)
  if (resizeObs) resizeObs.disconnect()
  // 正在房间里时离开页面，顺手退出房间，免得占着位置
  if (roomCode.value && !practiceMode.value) {
    leaveRace(roomCode.value).catch(() => {})
  }
})
</script>

<style scoped>
.race-page {
  max-width: 720px;
  margin: 0 auto;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.race-home, .race-lobby, .race-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
}
.race-logo {
  font-size: 64px;
  line-height: 1;
  margin-top: 12px;
}
.race-title {
  font-size: 28px;
  font-weight: bold;
}
.race-howto {
  color: var(--el-text-color-secondary);
  margin: 0;
  line-height: 1.6;
}
.home-btn {
  width: min(320px, 100%);
}
.join-row {
  display: flex;
  gap: 8px;
  width: min(320px, 100%);
}
.race-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin: 0;
}
.room-code-label {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.room-code {
  font-size: 44px;
  font-weight: bold;
  letter-spacing: 10px;
  color: var(--el-color-primary);
}
.section-title {
  align-self: flex-start;
  font-weight: bold;
  margin-top: 8px;
}
.player-row, .result-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
}
.player-info {
  flex: 1;
  min-width: 0;
}
.player-name {
  font-weight: bold;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.player-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.result-rank {
  font-size: 20px;
  font-weight: bold;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}
.result-score {
  font-weight: bold;
  color: var(--el-color-warning);
}
/* 比赛全屏：画布铺满，HUD 都叠在画布上面 */
.race-track {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.race-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: #ffd9a8;
}
.hud-exit {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top, 0px));
  left: 12px;
  z-index: 6;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #ff4d4f;
  color: #fff;
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.hud-timer {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  background: linear-gradient(180deg, #ffb03a, #ff7a1a);
  color: #fff;
  font-weight: bold;
  font-size: 20px;
  line-height: 1.25;
  text-align: center;
  padding: 5px 20px 4px;
  border-radius: 999px;
  border: 2px solid #ffd98c;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.hud-score {
  display: block;
  font-size: 12px;
  font-weight: normal;
  opacity: 0.95;
}
.hud-mute {
  position: absolute;
  top: calc(10px + env(safe-area-inset-top, 0px));
  right: 12px;
  z-index: 6;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.78);
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
/* 右侧加速圆钮（截图里那个灰色圆圈） */
.boost-circle {
  position: absolute;
  right: 20px;
  top: 56%;
  z-index: 6;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.85);
  background: rgba(120, 120, 120, 0.35);
  cursor: pointer;
  touch-action: none;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  padding: 0;
}
.boost-circle::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 54px;
  height: 54px;
  transform: translate(-50%, -50%);
  border: 3px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
}
.boost-circle:active {
  transform: scale(0.93);
}
.boost-circle:disabled {
  opacity: 0.35;
}
/* 底部进度条 + “我”气泡 */
.race-progress {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 5;
}
.progress-track {
  position: relative;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #ff5a3c, #ffb03a);
  border: 1.5px solid #ffd98c;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 6px;
  background: linear-gradient(90deg, #ffe066, #fff3b0);
}
.progress-dot {
  position: absolute;
  top: 50%;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  transition: left 0.4s linear;
}
.progress-flag {
  position: absolute;
  right: -6px;
  top: -18px;
  font-size: 16px;
}
.me-bubble {
  position: absolute;
  bottom: 18px;
  transform: translateX(-50%);
  background: #ffe066;
  color: #a35c00;
  font-weight: bold;
  font-size: 13px;
  line-height: 1.4;
  padding: 2px 10px;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  pointer-events: none;
}
.me-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #ffe066;
  border-bottom: 0;
}
.countdown {
  position: fixed;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  font-size: 96px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  z-index: 10;
}
.finish-tip {
  position: absolute;
  left: 50%;
  top: 62%;
  transform: translateX(-50%);
  z-index: 6;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  background: rgba(34, 197, 94, 0.9);
  padding: 8px 18px;
  border-radius: 999px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
}
</style>
