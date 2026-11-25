<template>
  <div class="race-page">
    <button class="exit-btn" type="button" @click="exitGame" aria-label="close">✕</button>
    <!-- 主页：建房 / 进房 / 单人练习 / 私信邀好友 -->
    <div v-if="screen === 'home'" class="race-home">
      <div class="race-logo">🏃</div>
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

    <!-- 跑酷：画布 + 实时排名 + 跳/滑按钮 -->
    <div v-else-if="screen === 'race'" class="race-track">
      <div class="race-progress">
        <div class="progress-track">
          <div v-for="p in standings" :key="p.userId" class="progress-dot"
               :style="{ left: pct(p.distance) + '%', background: colorOf(p.userId) }"
               :title="p.name" />
        </div>
        <div class="progress-names">
          <span v-for="p in standings" :key="p.userId" :style="{ color: colorOf(p.userId) }">
            {{ p.name }} {{ Math.floor(p.distance) }}m · {{ p.score }}
          </span>
        </div>
      </div>
      <canvas ref="canvasRef" class="race-canvas" @pointerdown="doJump" />
      <div class="race-hud">
        <span class="hud-hearts">{{ '❤️'.repeat(me.lives) }}{{ '🤍'.repeat(Math.max(0, 3 - me.lives)) }}</span>
        <span>{{ $t('raceDistance') }}: {{ Math.floor(me.distance) }}m</span>
        <span>{{ $t('raceScore') }}: {{ me.score }}</span>
      </div>
      <div class="control-row">
        <button class="control-btn jump-btn" type="button" :disabled="countdown > 0 || me.finished"
                @pointerdown.prevent="doJump">{{ $t('raceJump') }}</button>
        <button class="control-btn slide-btn" type="button" :disabled="countdown > 0 || me.finished"
                @pointerdown.prevent="doSlide">{{ $t('raceSlide') }}</button>
      </div>
      <div v-if="countdown > 0" class="countdown">{{ countdown }}</div>
      <div v-if="me.finished" class="finish-tip">{{ $t('raceWaitOthers') }}</div>
      <el-button link @click="doLeave">{{ $t('raceLeave') }}</el-button>
    </div>

    <!-- 结算：按距离排名 -->
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

// —— 天天酷跑式无尽跑酷：自动往前跑，跳 / 滑躲障碍，吃金币，撞 3 次结束 ——
// 赛道由房间码当种子生成：同一房间所有人跑同一条赛道（障碍和金币位置一样），才公平。
// 服务端只存 distance / score（distance 超过房间的 1000m 会被截断，
// 完赛也只认 distance>=1000），所以跑酷的“结束”只在本地算：
// 我撞满 3 次就按实际距离上报一次，成绩和排名都以本地为准。
const TRACK = 1000
const COURSE_END = 4000   // 本地生成的赛道长度（米），跑完 4000 米后不再出新障碍，只拼距离
const START_SPEED = 8     // m/s，起跑速度
const MAX_SPEED = 22
const RAMP = 0.35         // 每存活 1 秒提速 0.35 m/s
const HIT_SLOW = 0.55     // 撞一下速度掉到 55%
const INV_MS = 1000       // 撞后无敌 1 秒（闪烁）
const GRAVITY = 2300      // px/s^2
const JUMP_V = 820        // 第一段跳（780 太矮，个别障碍跳得吃力，提到 820；滞空约 0.71 秒）
const JUMP_V2 = 700       // 二段跳
const RUNNER_H = 56       // 站立高度 px
const SLIDE_H = 22        // 下滑高度 px
const BARRIER_BOTTOM = 40 // 悬空障碍板下沿离地高度：站立 56 会撞，下滑 22 能过
const SPIKE_H = 34        // 地刺高度：脚离地 34px 以上能跳过
const COLORS = ['#ff5a5a', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899']
const BOT_DEFS = [
  { name: '阿飞', skill: 0.74 },
  { name: '小美', skill: 0.83 },
  { name: '豆豆', skill: 0.92 }
]

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
// 私信里点 + 进来的：route.query.dm 是好友的 userId，主页会多一个“邀请好友一起跑”
const dmFriendId = computed(() => Number(route.query.dm) || 0)
// 赛场上的所有人：我 + 对手（多人是服务器数据，练习是机器人）
const standings = computed(() => {
  const list = runners.value.map(r => ({
    userId: r.userId, name: r.name, email: r.email || '', avatar: r.avatar || '',
    distance: r.distance, score: r.score, finished: r.finished, survivalMs: r.survivalMs
  }))
  return list.sort((a, b) => b.distance - a.distance)
})
const me = computed(() => runners.value.find(r => r.userId === myId.value)
  || { userId: myId.value, name: myName.value, distance: 0, score: 0, finished: false, lives: 3 })

// —— 每个人的跑步状态 ——
const runners = ref([])
let course = null // { obstacles: [{x, type, done}], coins: [{x, y, got}] }，按房间码生成
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
  const lead = Math.max(100, ...runners.value.map(r => r.distance))
  return Math.max(0, Math.min(100, (d / lead) * 100))
}
function fmtMs(ms) {
  if (ms == null) return ''
  const s = (ms / 1000).toFixed(1)
  return `${s}s`
}
function fmtResult(p) {
  const parts = [`${t('raceDistance')}: ${Math.floor(p.distance)}m`, `${t('raceScore')}: ${p.score}`]
  if (p.survivalMs != null) parts.push(`${t('raceTime')}: ${fmtMs(p.survivalMs)}`)
  return parts.join(' · ')
}
function runnerHeight(r) {
  return (r.sliding && !r.finished) ? SLIDE_H : RUNNER_H
}

function makeRunner(userId, name, avatar, email) {
  return {
    userId, name, avatar: avatar || '', email: email || '',
    distance: 0, speed: 0, score: 0, finished: false, survivalMs: null,
    lives: 3, coins: 0,
    // 只有我用物理字段；机器人用 nextObs / nextCoin 下标 + skill 模拟
    y: 0, vy: 0, jumps: 0, sliding: false, slideUntil: 0, invUntil: 0, jumpBufUntil: 0,
    nextObs: 0, nextCoin: 0, skill: 0, botStagger: 0
  }
}

// —— 赛道：FNV-1a 哈希房间码当种子 + mulberry32，和冰面炫舞同一套做法 ——
function hashSeed(str) {
  let h = 2166136261
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function buildCourse(seedStr) {
  const rand = mulberry32(hashSeed(seedStr))
  const obstacles = []
  const coins = []
  let d = 30 // 第一个障碍在 30 米，给起跑留一段空地
  while (d < COURSE_END) {
    const roll = rand()
    const type = roll < 0.42 ? 'spike' : roll < 0.74 ? 'barrier' : 'pit'
    obstacles.push({ x: d, type, done: false })
    // 金币：七成五的障碍带一串金币；地刺/坑的金币摆成跳跃弧线，悬空障碍的金币贴地（下滑时吃）
    if (rand() < 0.8) {
      const n = 3 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const cx = d - 2.2 + i * 1.15
        const cy = type === 'barrier' ? 16 : 58 + 30 * Math.sin((i / Math.max(1, n - 1)) * Math.PI)
        coins.push({ x: cx, y: cy, got: false })
      }
    }
    // 间距按刚放下的这段障碍的类型留（它决定了玩家离开它时所处的状态）：
    // 跳地刺 / 坑要 0.71 秒才落地（最高速约 15.7 米），下一段至少 16 米，
    // 不然人还在半空就撞上只能下滑的悬空板；悬空板下滑要 0.55 秒，
    // 下一段至少 13 米；全局最少 12 米
    let gap = 12 + rand() * 4
    if (type === 'spike' || type === 'pit') gap = Math.max(gap, 16 + rand() * 4)
    else if (type === 'barrier') gap = Math.max(gap, 13 + rand() * 3)
    d += gap
  }
  return { obstacles, coins }
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
  course = null
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
  course = null
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

async function exitGame() {
  // 不在主页时先离房（在房间里就退掉房间，练习直接停），再退出游戏
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
  BOT_DEFS.forEach((b, i) => {
    const bot = makeRunner(100000 + i, b.name, '', '')
    bot.skill = b.skill
    runners.value.push(bot)
  })
  enterRace(true)
}

// —— 开跑：倒数 3 秒，然后启动循环和轮询 ——
function enterRace(isPractice) {
  practiceMode.value = isPractice
  course = buildCourse(isPractice ? 'practice' : (roomCode.value || 'race'))
  if (!isPractice) {
    // 多人：按房间里的选手建跑步状态（保留我已跑的进度）
    const old = Object.fromEntries(runners.value.map(r => [r.userId, r]))
    runners.value = (players.value || []).map(p => {
      const r = old[p.userId] || makeRunner(p.userId, p.name, p.avatar, p.email)
      r.name = p.name; r.avatar = p.avatar || ''; r.email = p.email || ''
      r.distance = Math.max(r.distance, p.distance || 0)
      r.score = Math.max(r.score, p.score || 0)
      if (p.finished && !r.finished) { r.finished = true; r.survivalMs = p.finishMs }
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
      r.survivalMs = p.finishMs
      r.speed = 0
    }
  }
  checkFinish()
}

// —— 操作：跳（二段跳）/ 滑 ——
function doJump() {
  if (screen.value !== 'race' || countdown.value > 0) return
  const m = runners.value.find(r => r.userId === myId.value)
  if (!m || m.finished) return
  if (m.sliding) m.sliding = false
  if (m.jumps < 2) {
    m.vy = m.jumps === 0 ? JUMP_V : JUMP_V2
    m.jumps++
  } else {
    // 二段跳已用完：120ms 内落地就补跳（输入缓冲，手感更宽容）
    m.jumpBufUntil = Date.now() + 120
  }
}

function doSlide() {
  if (screen.value !== 'race' || countdown.value > 0) return
  const m = runners.value.find(r => r.userId === myId.value)
  if (!m || m.finished) return
  m.sliding = true
  m.slideUntil = Date.now() + 550
}

function onKey(e) {
  if (screen.value !== 'race') return
  if (e.code === 'ArrowUp' || e.code === 'Space') {
    if (e.repeat) return
    e.preventDefault()
    doJump()
  } else if (e.code === 'ArrowDown') {
    e.preventDefault()
    doSlide()
  }
}

// —— 碰撞：地刺要跳过，悬空障碍要下滑，坑要跳过 ——
function hitObstacle(r, o) {
  if (o.type === 'spike') return r.y < SPIKE_H
  if (o.type === 'barrier') return runnerHeight(r) > BARRIER_BOTTOM
  // 坑：贴地跑过去就掉进去；跳起来就没事。撞上后直接推到坑对面，免得原地反复撞
  if (r.y <= 1) {
    r.distance = o.x + 1.4
    return true
  }
  return false
}

function stepMe(r, dt, now) {
  if (r.finished || !course) return
  if (countdown.value > 0) { r.speed = 0; return }
  const aliveSec = Math.max(0, (now - raceStartClient - 3000) / 1000)
  const target = Math.min(MAX_SPEED, START_SPEED + RAMP * aliveSec)
  r.speed += (target - r.speed) * Math.min(1, 1.2 * dt)
  if (r.sliding && now >= r.slideUntil) r.sliding = false
  // 纵向物理
  if (r.y > 0 || r.vy !== 0) {
    r.vy -= GRAVITY * dt
    r.y += r.vy * dt
    if (r.y <= 0) {
      r.y = 0; r.vy = 0; r.jumps = 0
      // 输入缓冲：落地前 120ms 内按过跳，落地立刻起跳
      if (now < r.jumpBufUntil) {
        r.jumpBufUntil = 0
        r.vy = JUMP_V
        r.jumps = 1
      }
    }
  }
  r.distance += r.speed * dt
  r.score = Math.floor(r.distance) + r.coins * 10
  // 金币：按 x 顺序收，离得近且高度对得上才算吃到
  const cy = r.y + runnerHeight(r) / 2
  for (const c of course.coins) {
    if (c.got) continue
    if (c.x > r.distance + 1) break
    if (Math.abs(c.x - r.distance) < 0.7 && Math.abs(c.y - cy) < 36) {
      c.got = true
      r.coins++
      r.score = Math.floor(r.distance) + r.coins * 10
    }
  }
  // 障碍：按 x 顺序判定；无敌期间穿过去不扣命，跑过去了就标记掉
  const inv = now < r.invUntil
  for (const o of course.obstacles) {
    if (o.done) continue
    // 地刺的判定窗收窄到 ±0.9 米：跳跃升到 34px 需要约 0.93 米，
    // 窗口太宽会让“看到刺再起跳”的正常操作在窗口边沿就撞上；坑和悬空板保持 ±1.2 米
    const halfW = o.type === 'spike' ? 0.9 : 1.2
    if (o.x > r.distance + halfW) break
    if (o.x < r.distance - halfW) { o.done = true; continue }
    if (inv) continue
    if (hitObstacle(r, o)) {
      o.done = true
      r.lives--
      r.speed *= HIT_SLOW
      r.invUntil = now + INV_MS
      if (r.lives <= 0) { finishRun(r); return }
    }
  }
}

function stepBot(r, dt, now) {
  if (r.finished || !course) return
  if (countdown.value > 0) { r.speed = 0; return }
  const aliveSec = Math.max(0, (now - raceStartClient - 3000) / 1000)
  const target = Math.min(MAX_SPEED, START_SPEED + RAMP * aliveSec) * (0.94 + r.skill * 0.06)
  r.speed += (target - r.speed) * Math.min(1, 1.2 * dt)
  if (r.botStagger > 0) { r.botStagger -= dt; r.speed *= 0.7 }
  r.distance += r.speed * dt
  // 障碍：按顺序过，skill 决定躲过去还是撞上
  while (r.nextObs < course.obstacles.length) {
    const o = course.obstacles[r.nextObs]
    if (o.x > r.distance) break
    r.nextObs++
    if (Math.random() > r.skill) {
      r.lives--
      r.speed *= HIT_SLOW
      r.botStagger = 0.5
      if (r.lives <= 0) {
        r.finished = true
        r.speed = 0
        r.survivalMs = now - raceStartClient - 3000
        return
      }
    }
  }
  // 金币：按顺序收，skill 决定吃到几个
  while (r.nextCoin < course.coins.length) {
    const c = course.coins[r.nextCoin]
    if (c.x > r.distance) break
    r.nextCoin++
    if (Math.random() < r.skill) r.coins++
  }
  r.score = Math.floor(r.distance) + r.coins * 10
}

function stepRunner(r, dt, now) {
  if (r.userId === myId.value) stepMe(r, dt, now)
  else if (practiceMode.value) stepBot(r, dt, now)
  // 多人模式里对手位置由服务器推，本地不动他
}

function finishRun(r) {
  if (r.finished) return
  r.finished = true
  r.speed = 0
  r.y = 0; r.vy = 0; r.jumps = 0; r.sliding = false; r.jumpBufUntil = 0 // 落回地面，别冻在半空
  r.survivalMs = Math.max(0, Date.now() - raceStartClient - 3000)
  if (!practiceMode.value) {
    // 按实际距离和完赛标记上报一次（无尽跑酷没有终点线，完赛只认 finished 标记）
    updateProgress(roomCode.value, Math.floor(r.distance), r.score, true).catch(() => {})
  }
  ElMessage({ message: t('raceFinished'), type: 'success', plain: true })
  checkFinish()
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
    distance: r.distance, score: r.score, finished: r.finished, survivalMs: r.survivalMs
  }))
  // 排名：距离第一，距离一样比分数
  list.sort((a, b) => (b.distance - a.distance) || (b.score - a.score))
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

// —— 画布：横版跑酷场景 ——
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

// —— 画布：4399 风格卡通跑酷场景 ——
// 世界坐标用“米”：pxPerM = 画布宽 / 55 米。装饰物（云、树、花、石子）
// 按世界位置用哈希排布，同一房间所有人看到的风景一致。
// 特效（金币星光、落地尘土）只在绘制层维护，不碰游戏逻辑。
function hashN(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
let fxSparkles = [] // {wx, y, born} 金币拾取星光（世界坐标）
let fxDust = []     // {x, y, born, big} 落地 / 奔跑尘土
let fxPrevMeY = 0
let fxPrevCourse = null
let fxSquashUntil = 0
let fxLastDustAt = 0

function drawBackground(ctx, W, H, myDist, pxPerM, groundY, timeSec, toX) {
  // 天空：浅蓝 → 暖黄
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#5db8f0')
  sky.addColorStop(0.55, '#a5dcf7')
  sky.addColorStop(0.85, '#e8f7ff')
  sky.addColorStop(1, '#fff3c4')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)
  // 太阳：笑脸 + 慢慢转的光芒
  const sunX = W - 60
  const sunY = 54
  ctx.save()
  ctx.translate(sunX, sunY)
  ctx.rotate(timeSec * 0.08)
  ctx.strokeStyle = 'rgba(255, 214, 64, 0.9)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * 32, Math.sin(a) * 32)
    ctx.lineTo(Math.cos(a) * 42, Math.sin(a) * 42)
    ctx.stroke()
  }
  ctx.restore()
  ctx.fillStyle = '#ffd94d'
  ctx.beginPath()
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ff9f1c'
  ctx.beginPath()
  ctx.arc(sunX - 8, sunY - 4, 2.4, 0, Math.PI * 2)
  ctx.arc(sunX + 8, sunY - 4, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ff9f1c'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.arc(sunX, sunY + 2, 10, Math.PI * 0.15, Math.PI * 0.85)
  ctx.stroke()
  // 热气球：慢慢飘过天空
  const balX = ((timeSec * 9 + 240) % (W + 260)) - 130
  const balY = 76 + Math.sin(timeSec * 0.5) * 8
  ctx.fillStyle = '#ff6b6b'
  ctx.beginPath()
  ctx.ellipse(balX, balY, 20, 24, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd93d'
  ctx.beginPath()
  ctx.ellipse(balX, balY, 8, 24, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#8a5a2b'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(balX - 10, balY + 20)
  ctx.lineTo(balX - 6, balY + 32)
  ctx.moveTo(balX + 10, balY + 20)
  ctx.lineTo(balX + 6, balY + 32)
  ctx.stroke()
  ctx.fillStyle = '#a06a35'
  ctx.fillRect(balX - 7, balY + 32, 14, 10)
  // 云：视差 0.15，慢慢漂
  const span = W + 280
  const cloudOff = (myDist * pxPerM * 0.15 + timeSec * 5) % span
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (let i = 0; i < 4; i++) {
    const cx = (((i * 360 - cloudOff) % span) + span) % span - 140
    const cy = 44 + (i % 3) * 36
    const s = 0.8 + hashN(i * 7) * 0.5
    ctx.beginPath()
    ctx.ellipse(cx, cy, 44 * s, 15 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(cx + 28 * s, cy + 5 * s, 30 * s, 12 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(cx - 28 * s, cy + 6 * s, 26 * s, 10 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 远山（视差 0.25）：淡蓝
  ctx.fillStyle = '#a9c6e8'
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  for (let x = 0; x <= W; x += 14) {
    const wx = x + myDist * pxPerM * 0.25
    ctx.lineTo(x, groundY - 74 - 36 * Math.sin(wx * 0.008) - 16 * Math.sin(wx * 0.019 + 1.3))
  }
  ctx.lineTo(W, groundY)
  ctx.closePath()
  ctx.fill()
  // 近山丘（视差 0.5）：青绿圆丘
  ctx.fillStyle = '#8ed081'
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  for (let x = 0; x <= W; x += 14) {
    const wx = x + myDist * pxPerM * 0.5
    ctx.lineTo(x, groundY - 22 - 18 * Math.abs(Math.sin(wx * 0.011 + 2)))
  }
  ctx.lineTo(W, groundY)
  ctx.closePath()
  ctx.fill()
  // 树 / 灌木 / 花：每 7 米一个位置，哈希决定种类
  const slot = 7
  const k0 = Math.floor((myDist - 30) / slot)
  const k1 = Math.floor((myDist + 60) / slot)
  for (let k = k0; k <= k1; k++) {
    const x = toX(k * slot)
    if (x < -70 || x > W + 70) continue
    const h1 = hashN(k)
    const h2 = hashN(k * 3 + 1)
    if (h1 < 0.42) {
      // 大树
      const th = 46 + h2 * 22
      ctx.fillStyle = '#8a5a2b'
      ctx.fillRect(x - 3.5, groundY - 18, 7, 18)
      ctx.fillStyle = '#43a047'
      ctx.beginPath()
      ctx.arc(x, groundY - th + 16, 17, 0, Math.PI * 2)
      ctx.arc(x - 13, groundY - th + 26, 12, 0, Math.PI * 2)
      ctx.arc(x + 13, groundY - th + 26, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#66bb6a'
      ctx.beginPath()
      ctx.arc(x - 5, groundY - th + 12, 9, 0, Math.PI * 2)
      ctx.fill()
    } else if (h1 < 0.72) {
      // 灌木
      ctx.fillStyle = '#66bb6a'
      ctx.beginPath()
      ctx.arc(x - 8, groundY - 8, 11, 0, Math.PI * 2)
      ctx.arc(x + 8, groundY - 8, 12, 0, Math.PI * 2)
      ctx.arc(x, groundY - 14, 12, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // 小花
      const petal = ['#ff8fb3', '#ffd93d', '#ffffff', '#c58bff'][Math.floor(h2 * 4)]
      ctx.strokeStyle = '#43a047'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, groundY)
      ctx.lineTo(x, groundY - 16)
      ctx.stroke()
      ctx.fillStyle = petal
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * 4.5, groundY - 19 + Math.sin(a) * 4.5, 3.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#ff9f1c'
      ctx.beginPath()
      ctx.arc(x, groundY - 19, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawGround(ctx, W, H, myDist, pxPerM, groundY, toX) {
  // 泥土路
  const dirt = ctx.createLinearGradient(0, groundY, 0, H)
  dirt.addColorStop(0, '#b5773d')
  dirt.addColorStop(1, '#8a5a2b')
  ctx.fillStyle = dirt
  ctx.fillRect(0, groundY, W, H - groundY)
  // 草皮顶边：绿色带波浪底边
  ctx.fillStyle = '#58b368'
  ctx.beginPath()
  ctx.moveTo(0, groundY)
  ctx.lineTo(W, groundY)
  ctx.lineTo(W, groundY + 9)
  for (let x = W; x >= 0; x -= 12) {
    ctx.quadraticCurveTo(x - 6, groundY + 16, x - 12, groundY + 9)
  }
  ctx.closePath()
  ctx.fill()
  // 草皮上的亮草叶 + 泥土里的小石子（随地面滚动，每 3 米一个位置）
  const gap = 3
  const k0 = Math.floor((myDist - 30) / gap)
  const k1 = Math.floor((myDist + 60) / gap)
  ctx.strokeStyle = '#7ed081'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let k = k0; k <= k1; k++) {
    if (hashN(k * 5 + 1) < 0.45) continue
    const x = toX(k * gap)
    ctx.moveTo(x, groundY + 2)
    ctx.lineTo(x - 2, groundY - 5)
    ctx.moveTo(x + 3, groundY + 2)
    ctx.lineTo(x + 5, groundY - 4)
  }
  ctx.stroke()
  for (let k = k0; k <= k1; k++) {
    const h = hashN(k * 11 + 4)
    if (h < 0.55) continue
    const x = toX(k * gap)
    const y = groundY + 20 + hashN(k * 3) * Math.max(4, H - groundY - 28)
    ctx.fillStyle = 'rgba(90, 55, 25, 0.5)'
    ctx.beginPath()
    ctx.ellipse(x, y, 4 + h * 3, 2.5 + h * 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 地刺：木底座 + 三根金属刺 + 黄色警示牌
function drawSpikeAt(ctx, x, groundY) {
  ctx.fillStyle = '#8a5a2b'
  roundRect(ctx, x - 24, groundY - 7, 48, 8, 3)
  ctx.fill()
  ctx.fillStyle = '#6b4423'
  ctx.fillRect(x - 24, groundY - 3, 48, 2)
  for (let i = -1; i <= 1; i++) {
    const bx = x + i * 14
    const grad = ctx.createLinearGradient(bx - 8, 0, bx + 8, 0)
    grad.addColorStop(0, '#9aa0a6')
    grad.addColorStop(0.5, '#e8eaed')
    grad.addColorStop(1, '#7a7f85')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(bx - 8, groundY - 6)
    ctx.lineTo(bx, groundY - SPIKE_H)
    ctx.lineTo(bx + 8, groundY - 6)
    ctx.closePath()
    ctx.fill()
  }
  // 警示牌：黄色三角 + 感叹号
  ctx.strokeStyle = '#8a5a2b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - 34, groundY)
  ctx.lineTo(x - 34, groundY - 26)
  ctx.stroke()
  ctx.fillStyle = '#ffd93d'
  ctx.beginPath()
  ctx.moveTo(x - 34, groundY - 44)
  ctx.lineTo(x - 24, groundY - 26)
  ctx.lineTo(x - 44, groundY - 26)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#e8a800'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#333333'
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('!', x - 34, groundY - 32)
}

// 悬空板：吊绳 + 红白条纹板（下滑才能过）
function drawBarrierAt(ctx, x, w, groundY) {
  const top = groundY - BARRIER_BOTTOM - 26
  ctx.strokeStyle = '#7a7f85'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x - w / 2, 0)
  ctx.lineTo(x - w / 2, top)
  ctx.moveTo(x + w / 2, 0)
  ctx.lineTo(x + w / 2, top)
  ctx.stroke()
  ctx.save()
  roundRect(ctx, x - w / 2, top, w, 26, 5)
  ctx.clip()
  ctx.fillStyle = '#e23b3b'
  ctx.fillRect(x - w / 2, top, w, 26)
  ctx.fillStyle = '#ffffff'
  for (let s = 0; s < w; s += 18) {
    ctx.fillRect(x - w / 2 + s, top, 9, 26)
  }
  ctx.restore()
  ctx.strokeStyle = '#a11f1f'
  ctx.lineWidth = 2
  roundRect(ctx, x - w / 2, top, w, 26, 5)
  ctx.stroke()
  ctx.fillStyle = '#ffd93d'
  ctx.fillRect(x - w / 2 + 3, top + 21, w - 6, 3)
}

function draw(ctx, canvas, timeSec) {
  const W = canvas.clientWidth || 320
  const H = canvas.clientHeight || 320
  const m = runners.value.find(r => r.userId === myId.value)
  const myDist = m ? m.distance : 0
  const pxPerM = W / 55 // 屏幕宽度显示 55 米
  const runnerX = W * 0.22
  const groundY = H - 56
  const toX = d => runnerX + (d - myDist) * pxPerM

  // 换赛道时清掉特效
  if (fxPrevCourse !== course) {
    fxPrevCourse = course
    fxSparkles = []
    fxDust = []
    fxPrevMeY = 0
    fxSquashUntil = 0
  }
  // 落地检测：尘土 + 压扁
  if (m && !m.finished) {
    if (fxPrevMeY > 8 && m.y <= 0) {
      fxSquashUntil = timeSec + 0.16
      for (let i = 0; i < 4; i++) {
        fxDust.push({ x: runnerX - 14 + i * 9 + (hashN(i + 3) - 0.5) * 6, y: groundY + 2, born: timeSec, big: true })
      }
    }
    if (m.y <= 0 && m.speed > 10 && timeSec - fxLastDustAt > 0.22) {
      fxLastDustAt = timeSec
      fxDust.push({ x: runnerX - 12, y: groundY + 2, born: timeSec, big: false })
    }
    if (m.sliding && m.speed > 8 && timeSec - fxLastDustAt > 0.15) {
      fxLastDustAt = timeSec
      fxDust.push({ x: runnerX - 16, y: groundY + 2, born: timeSec, big: false })
    }
    fxPrevMeY = m.y
  }

  drawBackground(ctx, W, H, myDist, pxPerM, groundY, timeSec, toX)
  drawGround(ctx, W, H, myDist, pxPerM, groundY, toX)

  if (course) {
    // 坑：黑洞 + 碎裂边缘
    for (const o of course.obstacles) {
      if (o.type !== 'pit') continue
      const x0 = toX(o.x - 1.2)
      const x1 = toX(o.x + 1.2)
      if (x1 < -20 || x0 > W + 20) continue
      const w = x1 - x0
      ctx.fillStyle = '#1d0f04'
      ctx.fillRect(x0, groundY, w, H - groundY)
      const pitGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 26)
      pitGrad.addColorStop(0, '#000000')
      pitGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = pitGrad
      ctx.fillRect(x0, groundY, w, 26)
      ctx.fillStyle = '#6b4423'
      for (let i = 0; i < 4; i++) {
        const ex = x0 + (i + 0.5) * (w / 4) + (hashN(o.x * 10 + i) - 0.5) * 8
        ctx.beginPath()
        ctx.moveTo(ex - 6, groundY)
        ctx.lineTo(ex, groundY - 5 - hashN(i + o.x) * 4)
        ctx.lineTo(ex + 6, groundY)
        ctx.closePath()
        ctx.fill()
      }
    }
    // 金币：先记下新拾取的（出星光），再画
    for (const c of course.coins) {
      if (c.got && !c._fx) {
        c._fx = 1
        fxSparkles.push({ wx: c.x, y: c.y, born: timeSec })
      }
    }
    for (const c of course.coins) {
      const x = toX(c.x)
      if (x < -20 || x > W + 20 || c.got) continue
      const y = groundY - c.y
      const spin = Math.abs(Math.cos(timeSec * 4 + c.x))
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(0.4 + 0.6 * spin, 1)
      ctx.fillStyle = 'rgba(255, 207, 61, 0.35)'
      ctx.beginPath()
      ctx.arc(0, 0, 14, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffcf3d'
      ctx.beginPath()
      ctx.arc(0, 0, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#e8a800'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#b87700'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('★', 0, 1)
      ctx.restore()
    }
    // 障碍：地刺 / 悬空板（坑画在地面里了）
    for (const o of course.obstacles) {
      const x = toX(o.x)
      if (x < -60 || x > W + 60) continue
      if (o.type === 'spike') drawSpikeAt(ctx, x, groundY)
      else if (o.type === 'barrier') drawBarrierAt(ctx, x, 1.7 * pxPerM, groundY)
    }
  }

  // 高速速度线
  if (m && m.speed > 14 && !m.finished) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    for (let i = 0; i < 5; i++) {
      const bucket = Math.floor(timeSec * 9)
      const y = 40 + hashN(i * 31 + bucket) * Math.max(20, groundY - 90)
      const len = 50 + hashN(i * 17 + bucket) * 50
      const x = W - ((timeSec * 700 + i * 211) % (W + 160)) + 40
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 金币星光
  fxSparkles = fxSparkles.filter(s => timeSec - s.born < 0.45)
  for (const s of fxSparkles) {
    const age = timeSec - s.born
    const a = 1 - age / 0.45
    const x = toX(s.wx)
    const y = groundY - s.y
    ctx.save()
    ctx.globalAlpha = a
    ctx.strokeStyle = '#ffd93d'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const r0 = 4 + age * 34
      const r1 = 10 + age * 46
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0)
      ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 尘土
  fxDust = fxDust.filter(d => timeSec - d.born < 0.55)
  for (const d of fxDust) {
    const age = timeSec - d.born
    const a = (1 - age / 0.55) * 0.45
    const r = (d.big ? 7 : 5) + age * 22
    ctx.fillStyle = `rgba(198, 178, 148, ${a})`
    ctx.beginPath()
    ctx.arc(d.x, d.y - age * 8, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 所有选手（对手按服务器同步的位置画）
  for (const r of runners.value) {
    drawRunner(ctx, r, toX, groundY, timeSec, W)
  }

  // 每 100 米一个路标
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const mark0 = Math.max(100, Math.floor((myDist - 20) / 100) * 100)
  for (let d = mark0; d <= myDist + 60; d += 100) {
    ctx.fillText(`${d}m`, toX(d), groundY - 8)
  }

  // 左上角当前距离
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.font = 'bold 14px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`${Math.floor(myDist)}m`, 10, 22)
}

function drawRunner(ctx, r, toX, groundY, timeSec, W) {
  const x = toX(r.distance)
  if (x < -60 || x > W + 60) return
  const isMe = r.userId === myId.value
  const color = colorOf(r.userId)
  const sliding = r.sliding && !r.finished
  const h = sliding ? SLIDE_H : RUNNER_H
  const feetY = groundY - (isMe ? r.y : 0)
  const inv = isMe && Date.now() < r.invUntil
  // 影子：跳得越高越小越淡
  const airH = isMe ? r.y : 0
  const shScale = Math.max(0.45, 1 - airH / 320)
  ctx.fillStyle = `rgba(0,0,0,${(0.18 * shScale).toFixed(3)})`
  ctx.beginPath()
  ctx.ellipse(x, groundY + 4, 14 * shScale, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  if (inv && Math.floor(timeSec * 12) % 2 === 0) ctx.globalAlpha = 0.35
  ctx.translate(x, feetY)
  // 压扁拉伸：起跳拉长，落地瞬间压扁
  let sx = 1
  let sy = 1
  if (isMe && !sliding) {
    if (r.vy > 200) { sx = 0.93; sy = 1.09 }
    else if (r.vy < -200) { sx = 0.95; sy = 1.06 }
    if (timeSec < fxSquashUntil) { sx = 1.2; sy = 0.8 }
  }
  ctx.scale(sx, sy)
  const runPhase = timeSec * (6 + r.speed * 1.4)
  if (sliding) drawSlidePose(ctx, color, timeSec)
  else drawRunPose(ctx, color, runPhase, r.finished, isMe && r.y > 0, timeSec)
  ctx.restore()
  // 名字
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = isMe ? '#c0392b' : '#333'
  ctx.fillText(isMe ? `${r.name} (我)` : r.name, x, feetY - h - 8)
  if (isMe && !r.finished) {
    ctx.strokeStyle = '#ffd76a'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x, feetY - h / 2, 24, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// 卡通小人：奔跑循环（摆臂蹬腿）+ 红头带 + 坚定表情；空中是收腿姿势
function drawRunPose(ctx, color, phase, finished, airborne, timeSec) {
  const swing = finished ? 0 : Math.sin(phase)
  const armSwing = finished ? 0 : Math.sin(phase + 0.7)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // —— 后腿 + 后脚 ——
  ctx.strokeStyle = '#2b3a55'
  ctx.lineWidth = 5
  ctx.beginPath()
  if (airborne) {
    ctx.moveTo(-2, -18)
    ctx.lineTo(-9, -10)
    ctx.lineTo(-14, -6)
  } else {
    ctx.moveTo(-2, -18)
    ctx.lineTo(-2 - swing * 8, -9)
    ctx.lineTo(-2 - swing * 12, -1)
  }
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  if (airborne) ctx.ellipse(-15, -5, 6, 3.5, -0.3, 0, Math.PI * 2)
  else ctx.ellipse(-2 - swing * 12 + 2, -2, 6, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // —— 后臂（身体后面）——
  ctx.strokeStyle = color
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(2, -33)
  ctx.lineTo(2 - armSwing * 6, -26)
  ctx.stroke()
  ctx.strokeStyle = '#ffd9b3'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(2 - armSwing * 6, -26)
  ctx.lineTo(2 - armSwing * 10, -20)
  ctx.stroke()
  // —— 身体：彩色运动衫 ——
  ctx.fillStyle = color
  roundRect(ctx, -9, -38, 19, 22, 7)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  roundRect(ctx, -9, -38, 19, 7, 7)
  ctx.fill()
  // 腰带
  ctx.fillStyle = '#2b3a55'
  ctx.fillRect(-9, -18, 19, 4)
  // —— 前腿 + 前脚 ——
  ctx.strokeStyle = '#33415e'
  ctx.lineWidth = 5
  ctx.beginPath()
  if (airborne) {
    ctx.moveTo(2, -18)
    ctx.lineTo(10, -12)
    ctx.lineTo(8, -4)
  } else {
    ctx.moveTo(2, -18)
    ctx.lineTo(2 + swing * 8, -9)
    ctx.lineTo(2 + swing * 12, -1)
  }
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  if (airborne) ctx.ellipse(9, -3, 6, 3.5, 0.3, 0, Math.PI * 2)
  else ctx.ellipse(2 + swing * 12 + 2, -2, 6, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // —— 前臂 ——
  ctx.strokeStyle = color
  ctx.lineWidth = 4.5
  ctx.beginPath()
  ctx.moveTo(4, -33)
  ctx.lineTo(4 + armSwing * 6, -26)
  ctx.stroke()
  ctx.strokeStyle = '#ffd9b3'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(4 + armSwing * 6, -26)
  ctx.lineTo(4 + armSwing * 10, -20)
  ctx.stroke()
  // —— 头 ——
  const headX = 4
  const headY = -46
  ctx.fillStyle = '#ffd9b3'
  ctx.beginPath()
  ctx.arc(headX, headY, 10, 0, Math.PI * 2)
  ctx.fill()
  // 头发
  ctx.fillStyle = '#5b3a29'
  ctx.beginPath()
  ctx.arc(headX, headY - 1, 10, Math.PI * 1.02, Math.PI * 1.98)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(headX - 6, headY - 9)
  ctx.lineTo(headX - 2, headY - 14)
  ctx.lineTo(headX + 1, headY - 9)
  ctx.closePath()
  ctx.fill()
  // 红头带 + 飘带
  ctx.strokeStyle = '#e23b3b'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(headX, headY, 10, -2.7, -0.45)
  ctx.stroke()
  const flutter = Math.sin(timeSec * 10) * 2.5
  ctx.strokeStyle = '#e23b3b'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(headX - 9, headY - 3)
  ctx.lineTo(headX - 17, headY - 6 + flutter)
  ctx.moveTo(headX - 9, headY)
  ctx.lineTo(headX - 16, headY + 3 - flutter)
  ctx.stroke()
  // 眼睛 + 坚定的眉毛 + 笑容
  ctx.fillStyle = '#222222'
  ctx.beginPath()
  ctx.arc(headX + 4, headY - 1, 1.7, 0, Math.PI * 2)
  ctx.arc(headX - 2, headY - 1, 1.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#5b3a29'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(headX + 1, headY - 5.5)
  ctx.lineTo(headX + 6, headY - 4.5)
  ctx.moveTo(headX - 5, headY - 5.5)
  ctx.lineTo(headX - 1, headY - 4.5)
  ctx.stroke()
  ctx.strokeStyle = '#c25e3a'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.arc(headX + 4, headY + 3, 3.5, Math.PI * 0.15, Math.PI * 0.85)
  ctx.stroke()
}

// 下滑姿势：低身前蹲，双腿前伸
function drawSlidePose(ctx, color, timeSec) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // 双腿前伸
  ctx.strokeStyle = '#2b3a55'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(-6, -10)
  ctx.lineTo(14, -3)
  ctx.moveTo(-4, -8)
  ctx.lineTo(17, -2)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(16, -3, 6, 3.5, 0.2, 0, Math.PI * 2)
  ctx.ellipse(19, -2, 6, 3.5, 0.2, 0, Math.PI * 2)
  ctx.fill()
  // 身体前倾
  ctx.fillStyle = color
  ctx.save()
  ctx.translate(-2, -13)
  ctx.rotate(-0.18)
  roundRect(ctx, -15, -7, 30, 13, 6)
  ctx.fill()
  ctx.restore()
  // 后撑的手
  ctx.strokeStyle = '#ffd9b3'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(-8, -10)
  ctx.lineTo(-16, -4)
  ctx.stroke()
  // 头
  ctx.fillStyle = '#ffd9b3'
  ctx.beginPath()
  ctx.arc(13, -19, 9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5b3a29'
  ctx.beginPath()
  ctx.arc(13, -20, 9, Math.PI * 1.02, Math.PI * 1.98)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#e23b3b'
  ctx.lineWidth = 3.5
  ctx.beginPath()
  ctx.arc(13, -19, 9, -2.7, -0.45)
  ctx.stroke()
  ctx.fillStyle = '#222222'
  ctx.beginPath()
  ctx.arc(16, -20, 1.6, 0, Math.PI * 2)
  ctx.fill()
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
  window.removeEventListener('keydown', onKey)
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
  height: 100dvh;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.race-home, .race-lobby, .race-results {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
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
.race-track {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.race-progress {
  flex-shrink: 0;
  padding-right: 48px;
  box-sizing: border-box;
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
.progress-names {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 6px;
  font-size: 12px;
}
.race-canvas {
  flex: 1;
  min-height: 0;
  width: 100%;
  border-radius: 12px;
  display: block;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: #7ec3ee;
}
.race-hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
}
.hud-hearts {
  letter-spacing: 2px;
}
.control-row {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}
.control-btn {
  flex: 1;
  height: 64px;
  border: none;
  border-radius: 32px;
  color: #fff;
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.control-btn:active {
  transform: scale(0.97);
}
.control-btn:disabled {
  opacity: 0.5;
}
.jump-btn {
  background: linear-gradient(180deg, #ffb020, #f57c00);
  box-shadow: 0 4px 12px rgba(245, 124, 0, 0.35);
}
.slide-btn {
  background: linear-gradient(180deg, #4fc3f7, #1976d2);
  box-shadow: 0 4px 12px rgba(25, 118, 210, 0.35);
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
  margin-top: 2px;
  font-size: 16px;
  font-weight: bold;
  color: var(--el-color-warning);
  text-align: center;
}
</style>
