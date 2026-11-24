<template>
  <div class="race-page">
    <!-- 主页：建房 / 进房 / 单人练习 -->
    <div v-if="screen === 'home'" class="race-home">
      <div class="race-logo">🏃</div>
      <div class="race-title">{{ $t('cmfly') }}</div>
      <p class="race-howto">{{ $t('raceHowTo') }}</p>
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

    <!-- 比赛：画布 + 进度条 + 加速按钮 -->
    <div v-else-if="screen === 'race'" class="race-track">
      <div class="race-progress">
        <div class="progress-track">
          <div v-for="p in standings" :key="p.userId" class="progress-dot"
               :style="{ left: pct(p.distance) + '%', background: colorOf(p.userId) }"
               :title="p.name" />
          <div class="progress-flag">🏁</div>
        </div>
        <div class="progress-names">
          <span v-for="p in standings" :key="p.userId" :style="{ color: colorOf(p.userId) }">
            {{ p.name }} {{ Math.floor(p.distance) }}m
          </span>
        </div>
      </div>
      <canvas ref="canvasRef" class="race-canvas" @pointerdown="onBoost" />
      <div class="race-hud">
        <span>{{ $t('raceDistance') }}: {{ Math.floor(me.distance) }} / {{ trackLength }} m</span>
        <span>{{ $t('raceScore') }}: {{ me.score }}</span>
      </div>
      <button class="boost-btn" type="button" :disabled="countdown > 0 || me.finished"
              @pointerdown="onBoost">{{ $t('raceTapBoost') }}</button>
      <div v-if="countdown > 0" class="countdown">{{ countdown }}</div>
      <div v-if="me.finished" class="finish-tip">{{ $t('raceFinished') }}</div>
      <el-button link @click="doLeave">{{ $t('raceLeave') }}</el-button>
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

// —— 赛道是固定的：所有人跑同一条 1000 米坡道，红包和炮竹位置一样 ——
const TRACK = 1000
const RED_PACKETS = [80, 150, 230, 310, 380, 470, 540, 620, 700, 790, 860, 930]
const FIRECRACKERS = [120, 200, 280, 350, 430, 510, 590, 660, 750, 830, 900, 960]
const BASE_SPEED = 4      // 不点也会慢慢往下滑
const TAP_ADD = 2.2       // 每点一下加的速度
const MAX_SPEED = 24
const DECAY = 0.55        // 速度向下滑速度回落的快慢
const PACKET_BOOST = 3
const PACKET_SCORE = 100
const CRACKER_SCORE = 50
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

const myId = computed(() => userStore.user?.userId || 0)
const myName = computed(() => userStore.user?.name || (userStore.user?.email || '').split('@')[0] || '我')
const isHost = computed(() => !!room.value && room.value.hostUserId === myId.value)
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
    gotPackets: new Set(), hitCrackers: new Set(), botTarget: 0, botTimer: 0
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
  // 红包 / 炮竹：按固定位置判定，每人各吃各的
  for (const pos of RED_PACKETS) {
    if (r.distance >= pos && !r.gotPackets.has(pos)) {
      r.gotPackets.add(pos)
      r.score += PACKET_SCORE
      r.speed = Math.min(MAX_SPEED, r.speed + PACKET_BOOST)
      if (r.userId === myId.value) ElMessage({ message: t('raceRedPacket'), type: 'success', plain: true, grouping: true })
    }
  }
  for (const pos of FIRECRACKERS) {
    if (r.distance >= pos && !r.hitCrackers.has(pos)) {
      r.hitCrackers.add(pos)
      r.score = Math.max(0, r.score - CRACKER_SCORE)
      r.speed *= 0.5
      if (r.userId === myId.value) ElMessage({ message: t('raceFirecracker'), type: 'warning', plain: true, grouping: true })
    }
  }
  if (r.distance >= trackLength.value) {
    r.distance = trackLength.value
    r.finished = true
    r.speed = 0
    r.finishMs = now - raceStartClient - 3000 // 扣掉 3 秒倒数
    if (r.userId === myId.value) ElMessage({ message: t('raceFinished'), type: 'success', plain: true })
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

// —— 画布：下坡赛道 + 小人 + 红包炮竹 ——
function slopeY(d) {
  return 150 + d * 0.06 + 42 * Math.sin(d * 0.02) + 14 * Math.sin(d * 0.053)
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
  const camX = Math.max(0, leader - 45)
  const pxPerM = W / 150
  const camY = slopeY(Math.max(0, leader)) - H * 0.55
  const toX = d => (d - camX) * pxPerM
  const toY = d => slopeY(d) - camY

  // 天空
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#8ec9ee')
  sky.addColorStop(1, '#e8f6ff')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)
  // 远山
  ctx.fillStyle = 'rgba(120, 180, 120, 0.45)'
  ctx.beginPath()
  ctx.moveTo(0, H * 0.32)
  for (let x = 0; x <= W; x += 20) {
    ctx.lineTo(x, H * 0.32 + 18 * Math.sin((x + camX * pxPerM * 0.3) * 0.01))
  }
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()
  // 坡面
  ctx.beginPath()
  ctx.moveTo(-10, H + 10)
  for (let d = camX - 10; d <= camX + 160; d += 2) {
    ctx.lineTo(toX(d), toY(d))
  }
  ctx.lineTo(W + 10, H + 10)
  ctx.closePath()
  const gnd = ctx.createLinearGradient(0, 0, 0, H)
  gnd.addColorStop(0, '#7ec850')
  gnd.addColorStop(1, '#4da33a')
  ctx.fillStyle = gnd
  ctx.fill()
  // 赛道白虚线
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 2
  ctx.setLineDash([12, 14])
  ctx.beginPath()
  for (let d = camX - 10; d <= camX + 160; d += 2) {
    const x = toX(d), y = toY(d)
    if (d === camX - 10) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.setLineDash([])
  // 终点线
  if (toX(TRACK) >= -20 && toX(TRACK) <= W + 20) {
    const fx = toX(TRACK)
    ctx.fillStyle = '#222'
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(fx - 5, toY(TRACK) - 70 + i * 9, 10, 9)
    }
    ctx.fillStyle = '#222'
    ctx.font = 'bold 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🏁', fx, toY(TRACK) - 78)
  }
  // 红包和炮竹
  for (const pos of RED_PACKETS) {
    const x = toX(pos)
    if (x < -30 || x > W + 30) continue
    const y = toY(pos)
    ctx.fillStyle = '#e23b3b'
    roundRect(ctx, x - 9, y - 26, 18, 22, 4)
    ctx.fill()
    ctx.fillStyle = '#ffd76a'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('¥', x, y - 10)
  }
  for (const pos of FIRECRACKERS) {
    const x = toX(pos)
    if (x < -30 || x > W + 30) continue
    const y = toY(pos)
    ctx.fillStyle = '#c0392b'
    roundRect(ctx, x - 6, y - 18, 12, 18, 3)
    ctx.fill()
    ctx.strokeStyle = '#8e44ad'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - 18)
    ctx.quadraticCurveTo(x + 6, y - 26, x + 10, y - 22)
    ctx.stroke()
    ctx.fillStyle = '#ffd76a'
    ctx.beginPath()
    ctx.arc(x + 10, y - 22, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  // 小人
  for (const r of runners.value) {
    const x = toX(r.distance)
    if (x < -40 || x > W + 40) continue
    const y = toY(r.distance)
    const isMe = r.userId === myId.value
    const color = colorOf(r.userId)
    const bob = Math.sin(timeSec * (4 + r.speed)) * Math.min(3, r.speed * 0.15)
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.ellipse(x, y + 2, 13, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    // 腿（跑动摆动）
    const swing = Math.sin(timeSec * (6 + r.speed * 1.2)) * Math.min(6, 2 + r.speed * 0.3)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - 3, y - 12)
    ctx.lineTo(x - 3 + swing, y - 1)
    ctx.moveTo(x + 3, y - 12)
    ctx.lineTo(x + 3 - swing, y - 1)
    ctx.stroke()
    // 身体
    ctx.fillStyle = color
    roundRect(ctx, x - 10, y - 30, 20, 20, 8)
    ctx.fill()
    // 头
    ctx.fillStyle = '#ffd9b3'
    ctx.beginPath()
    ctx.arc(x, y - 38 + bob * 0.4, 11, 0, Math.PI * 2)
    ctx.fill()
    // 头发
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y - 40 + bob * 0.4, 11, Math.PI, Math.PI * 2)
    ctx.fill()
    // 眼睛
    ctx.fillStyle = '#222'
    ctx.beginPath()
    ctx.arc(x + 4, y - 38 + bob * 0.4, 1.6, 0, Math.PI * 2)
    ctx.fill()
    // 名字
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = isMe ? '#c0392b' : '#333'
    ctx.fillText(isMe ? `${r.name} (我)` : r.name, x, y - 54 + bob * 0.4)
    if (isMe) {
      ctx.strokeStyle = '#ffd76a'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y - 26, 22, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  // 距离刻度
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`${Math.floor(leader)}m / ${trackLength.value}m`, 10, 20)
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
  const code = route.query.code
  if (code && typeof code === 'string') {
    joinCode.value = code.toUpperCase()
    doJoin(code)
  }
})

onUnmounted(() => {
  stopAllTimers()
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
  padding: 16px;
  box-sizing: border-box;
}
.race-home, .race-lobby, .race-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
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
.race-progress {
  margin-bottom: 8px;
}
.progress-track {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: var(--el-fill-color-light);
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
  top: -16px;
  font-size: 16px;
}
.progress-names {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 12px;
}
.race-canvas {
  width: 100%;
  height: 320px;
  border-radius: 12px;
  display: block;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: #8ec9ee;
}
.race-hud {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 14px;
  font-weight: bold;
}
.boost-btn {
  width: 100%;
  height: 72px;
  margin-top: 12px;
  border: none;
  border-radius: 36px;
  background: linear-gradient(180deg, #ff7a45, #f5222d);
  color: #fff;
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 4px 12px rgba(245, 34, 45, 0.35);
}
.boost-btn:active {
  transform: scale(0.97);
}
.boost-btn:disabled {
  opacity: 0.5;
}
.countdown {
  position: fixed;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  font-size: 96px;
  font-weight: bold;
  color: var(--el-color-primary);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  z-index: 10;
}
.finish-tip {
  margin-top: 10px;
  font-size: 18px;
  font-weight: bold;
  color: var(--el-color-success);
}
</style>
