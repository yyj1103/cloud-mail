<template>
  <div class="dance-page">
    <!-- 首页 -->
    <div v-if="screen === 'home'" class="home">
      <div class="game-title">⛸️ {{ $t('dance') }}</div>
      <div class="game-sub">{{ $t('danceSub') }}</div>
      <div class="howto">
        <div>🎵 {{ $t('danceHow1') }}</div>
        <div>⭐ {{ $t('danceHow2') }}</div>
        <div>🔥 {{ $t('danceHow3') }}</div>
        <div>👯 {{ $t('danceHow4') }}</div>
      </div>
      <el-button type="primary" size="large" class="home-btn" :loading="creating" @click="doCreate">{{ $t('danceCreateRoom') }}</el-button>
      <div class="join-row">
        <el-input v-model="joinCode"  :placeholder="$t('danceEnterCode')"  maxlength="6" clearable @keyup.enter="doJoin" />
        <el-button :loading="joining" @click="doJoin">{{ $t('danceJoinRoom') }}</el-button>
      </div>
      <el-button size="large" class="home-btn" @click="startPractice">{{ $t('dancePractice') }}</el-button>
    </div>

    <!-- 大厅 -->
    <div v-else-if="screen === 'lobby'" class="lobby">
      <div class="lobby-title">{{ $t('danceRoomCode') }}</div>
      <div class="room-code">{{ roomCode }}</div>
      <el-button class="copy-btn" @click="copyInvite">{{ $t('danceCopyInvite') }}</el-button>
      <div class="player-list">
        <div v-for="p in roomPlayers" :key="p.userId" class="player-row">
          <span class="player-dot" :style="{ background: playerColor(p.userId) }"></span>
          <span class="player-name">{{ p.name || p.email || $t('danceYou') }}</span>
          <span v-if="p.userId === roomData?.hostUserId" class="host-tag">{{ $t('danceHost') }}</span>
          <span v-if="p.userId === myId" class="me-tag">{{ $t('danceYou') }}</span>
        </div>
        <el-empty v-if="!roomPlayers.length" :description="$t('danceNoPlayers')" />
      </div>
      <el-button v-if="isHost" type="primary" size="large" class="home-btn" :loading="starting" @click="doStart">{{ $t('danceStart') }}</el-button>
      <div v-else class="waiting-tip">{{ $t('danceWaitingHost') }}</div>
      <el-button link class="leave-link" @click="doLeave">{{ $t('danceLeave') }}</el-button>
    </div>

    <!-- 跳舞 -->
    <div v-else-if="screen === 'dance'" class="dance">
      <div class="top-bar">
        <div class="score-box">
          <div class="score-label">{{ $t('danceScore') }}</div>
          <div class="score-num">{{ score }}</div>
        </div>
        <div class="combo-box" :class="{ hot: combo >= 10 }">
          <div class="combo-label">{{ $t('danceCombo') }}</div>
          <div class="combo-num">{{ combo }}</div>
        </div>
        <el-button link class="mute-btn" @click="muted = !muted">{{ muted ? $t('danceMuted') : $t('danceMusic') }}</el-button>
      </div>
      <div class="progress-bar"><div class="progress-fill" :style="{ width: songProgress + '%' }"></div></div>
      <div class="live-list">
        <div v-for="p in livePlayers" :key="p.userId" class="live-row" :class="{ me: p.userId === myId }">
          <span class="player-dot" :style="{ background: p.color }"></span>
          <span class="live-name">{{ p.name }}</span>
          <span class="live-score">{{ p.score }}</span>
          <span v-if="p.finished" class="finished-tag">{{ $t('danceFinished') }}</span>
        </div>
      </div>
      <div class="stage">
        <div class="lanes">
          <div v-for="lane in 4" :key="lane" class="lane" :class="'lane-' + lane">
            <div
              v-for="arrow in visibleArrows(lane - 1)"
              :key="arrow.time + '-' + arrow.dir"
              class="arrow"
              :class="'arrow-' + arrow.dir"
              :style="{ top: arrowTop(arrow) + '%' }"
            >{{ arrowGlyph(arrow.dir) }}</div>
          </div>
        </div>
        <div class="judge-line"></div>
        <div class="avatar" :class="avatarPoseClass" :style="{ '--avatar-color': myColor }">
          <div class="avatar-head"><span class="eye left"></span><span class="eye right"></span><span class="mouth"></span></div>
          <div class="avatar-body"></div>
          <div class="avatar-feet"><span></span><span></span></div>
        </div>
        <div v-if="judgePop" :key="judgePopKey" class="judge-pop" :class="'pop-' + judgePopClass">{{ judgePop }}</div>
        <div v-if="countdown > 0" class="countdown">{{ countdown }}</div>
        <div v-if="countdown === 0 && songOver" class="countdown small">{{ $t('danceDone') }}</div>
      </div>
      <div class="pad">
        <button
          v-for="dir in [0, 1, 2, 3]"
          :key="dir"
          class="pad-btn"
          :class="'pad-' + dir"
          type="button"
          @pointerdown.prevent="hit(dir)"
        >{{ arrowGlyph(dir) }}</button>
      </div>
      <div class="pad-hint">{{ $t('danceKeyboardHint') }}</div>
    </div>

    <!-- 结算 -->
    <div v-else-if="screen === 'results'" class="results">
      <div class="results-title">🏆 {{ $t('danceRanking') }}</div>
      <div class="rank-list">
        <div v-for="(p, i) in rankedPlayers" :key="p.userId" class="rank-row" :class="{ me: p.userId === myId }">
          <span class="rank-no">{{ i + 1 }}</span>
          <span class="player-dot" :style="{ background: p.color }"></span>
          <span class="rank-name">{{ p.name }}</span>
          <span class="rank-score">{{ p.score }}</span>
        </div>
      </div>
      <div class="my-stats">
        <div class="stats-title">{{ $t('danceMyStats', { grade: myGrade }) }}</div>
        <div class="stats-grid">
          <div><div class="stats-num">{{ score }}</div><div class="stats-label">{{ $t('danceScore') }}</div></div>
          <div><div class="stats-num">{{ myAccuracy }}%</div><div class="stats-label">{{ $t('danceAccuracy') }}</div></div>
          <div><div class="stats-num">{{ maxCombo }}</div><div class="stats-label">{{ $t('danceMaxCombo') }}</div></div>
        </div>
        <div class="judge-counts">
          <span class="c-perfect">Perfect {{ counts.perfect }}</span>
          <span class="c-great">Great {{ counts.great }}</span>
          <span class="c-good">Good {{ counts.good }}</span>
          <span class="c-miss">Miss {{ counts.miss }}</span>
        </div>
      </div>
      <el-button type="primary" size="large" class="home-btn" @click="playAgain">{{ $t('dancePlayAgain') }}</el-button>
      <el-button size="large" class="home-btn" @click="backHome">{{ $t('danceBack') }}</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user.js'
import { createDance, joinDance, getDanceRoom, startDance, updateDanceScore, leaveDance } from '@/request/dance.js'

const { t } = useI18n()
const route = useRoute()
const userStore = useUserStore()

const BPM = 128
const BEAT = 60 / BPM
const SONG_BEATS = 160
const TRAVEL = 2.0
const PERFECT_WIN = 0.06
const GREAT_WIN = 0.12
const GOOD_WIN = 0.2
const JUDGE_LINE = 82
const GLYPHS = ['←', '↓', '↑', '→']
const COLORS = ['#f56c6c', '#e6a23c', '#67c23a', '#409eff', '#b37feb', '#ff85c0', '#13c2c2', '#ff7a45']
const BOT_DEFS = [
  { name: '阿冰', skill: 0.78 },
  { name: '小舞', skill: 0.86 },
  { name: '雪宝', skill: 0.93 }
]

const screen = ref('home')
const mode = ref('room')
const roomCode = ref('')
const joinCode = ref('')
const roomData = ref(null)
const creating = ref(false)
const joining = ref(false)
const starting = ref(false)
const countdown = ref(0)
const songOver = ref(false)
const muted = ref(false)

const myId = computed(() => userStore.user?.userId || 0)
const myName = computed(() => userStore.user?.name || (userStore.user?.email || '').split('@')[0] || '我')
const myColor = computed(() => playerColor(myId.value))
const isHost = computed(() => !!roomData.value && roomData.value.hostUserId === myId.value)
const roomPlayers = computed(() => roomData.value?.players || [])
const songEnd = computed(() => (chart.value.length ? chart.value[chart.value.length - 1].time : 0) + 1.2)
const songProgress = computed(() => {
  if (!songEnd.value) return 0
  return Math.max(0, Math.min(100, (nowSec.value / songEnd.value) * 100))
})

const chart = ref([])
const nowSec = ref(0)
const score = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const counts = ref({ perfect: 0, great: 0, good: 0, miss: 0 })
const judgePop = ref('')
const judgePopKey = ref(0)
const judgePopClass = ref('')
const lastDir = ref(2)
const poseUntil = ref(0)
const spinning = ref(false)
const bots = ref([])

const avatarPoseClass = computed(() => {
  const classes = []
  if (nowSec.value < poseUntil.value) classes.push('pose-' + lastDir.value)
  if (spinning.value) classes.push('spinning')
  return classes.join(' ')
})

const myAccuracy = computed(() => {
  const c = counts.value
  const total = c.perfect + c.great + c.good + c.miss
  if (!total) return 100
  return Math.round(((c.perfect + c.great * 0.65 + c.good * 0.35) / total) * 100)
})
const myGrade = computed(() => {
  const a = myAccuracy.value
  if (a >= 95) return 'S'
  if (a >= 90) return 'A'
  if (a >= 80) return 'B'
  return 'C'
})

const livePlayers = computed(() => {
  if (mode.value === 'practice') {
    const list = [{ userId: myId.value, name: myName.value, color: myColor.value, score: score.value, finished: songOver.value }]
    for (const b of bots.value) list.push({ userId: b.userId, name: b.name, color: b.color, score: b.score, finished: songOver.value })
    return list.sort((a, b) => b.score - a.score)
  }
  return (roomData.value?.players || []).map(p => ({
    userId: p.userId,
    name: p.name || p.email || '我',
    color: playerColor(p.userId),
    score: p.userId === myId.value ? score.value : p.score,
    finished: p.userId === myId.value ? songOver.value : !!p.finished
  })).sort((a, b) => b.score - a.score)
})

const rankedPlayers = computed(() => {
  if (mode.value === 'practice') {
    const list = [{ userId: myId.value, name: myName.value, color: myColor.value, score: score.value, perfect: counts.value.perfect, great: counts.value.great, good: counts.value.good, miss: counts.value.miss, maxCombo: maxCombo.value }]
    for (const b of bots.value) list.push({ userId: b.userId, name: b.name, color: b.color, score: b.score, perfect: b.perfect, great: b.great, good: b.good, miss: b.miss, maxCombo: b.maxCombo })
    return list.sort((a, b) => b.score - a.score)
  }
  const list = (roomData.value?.players || []).map(p => {
    if (p.userId === myId.value) {
      return { userId: p.userId, name: p.name || p.email || '我', color: playerColor(p.userId), score: score.value, perfect: counts.value.perfect, great: counts.value.great, good: counts.value.good, miss: counts.value.miss, maxCombo: maxCombo.value }
    }
    return { userId: p.userId, name: p.name || p.email || '我', color: playerColor(p.userId), score: p.score, perfect: p.perfect, great: p.great, good: p.good, miss: p.miss, maxCombo: p.maxCombo }
  })
  if (!list.some(p => p.userId === myId.value)) {
    list.push({ userId: myId.value, name: myName.value, color: myColor.value, score: score.value, perfect: counts.value.perfect, great: counts.value.great, good: counts.value.good, miss: counts.value.miss, maxCombo: maxCombo.value })
  }
  return list.sort((a, b) => b.score - a.score)
})

function playerColor(userId) {
  return COLORS[Math.abs(Number(userId) || 0) % COLORS.length]
}
function arrowGlyph(dir) {
  return GLYPHS[dir] || '↑'
}

// ---- 谱面：按房间码当种子，所有人同一张谱 ----
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
function buildChart(seedStr) {
  const rand = mulberry32(hashSeed(seedStr))
  const list = []
  let lastDir = -1
  let sameRun = 0
  for (let i = 8; i < SONG_BEATS; i++) {
    if (rand() < 0.82) {
      let dir = Math.floor(rand() * 4)
      if (dir === lastDir) {
        sameRun++
        if (sameRun >= 2) {
          dir = (dir + 1 + Math.floor(rand() * 3)) % 4
          sameRun = 0
        }
      } else {
        sameRun = 0
      }
      lastDir = dir
      list.push({ time: i * BEAT, dir, judged: false, result: '' })
      if (rand() < 0.12) {
        const dir2 = (dir + 1 + Math.floor(rand() * 3)) % 4
        list.push({ time: i * BEAT, dir: dir2, judged: false, result: '' })
      }
    }
    if (rand() < 0.16) {
      list.push({ time: (i + 0.5) * BEAT, dir: Math.floor(rand() * 4), judged: false, result: '' })
    }
  }
  list.sort((a, b) => a.time - b.time)
  return list
}
function visibleArrows(lane) {
  const now = nowSec.value
  return chart.value.filter(a => a.dir === lane && !a.judged && (a.time - now) <= TRAVEL && (a.time - now) >= -0.25)
}
function arrowTop(arrow) {
  const remain = arrow.time - nowSec.value
  return Math.max(0, JUDGE_LINE * (1 - remain / TRAVEL))
}

// ---- WebAudio 合成伴奏（无外部音频文件，失败就静音玩） ----
let audioCtx = null
let masterGain = null
function ensureAudio() {
  if (muted.value) return
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      audioCtx = new AC()
      masterGain = audioCtx.createGain()
      masterGain.gain.value = 0.4
      masterGain.connect(audioCtx.destination)
    }
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch (e) {
    audioCtx = null
  }
}
function blip(freq, dur, type, vol) {
  if (!audioCtx || muted.value) return
  try {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = type || 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur)
    osc.connect(gain)
    gain.connect(masterGain)
    osc.start()
    osc.stop(audioCtx.currentTime + dur)
  } catch (e) {
    // 忽略
  }
}
function kick() {
  if (!audioCtx || muted.value) return
  try {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.14)
    osc.connect(gain)
    gain.connect(masterGain)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.15)
  } catch (e) {
    // 忽略
  }
}
function playHit(res) {
  if (res === 'perfect') blip(880, 0.07, 'sine', 0.18)
  else if (res === 'great') blip(660, 0.07, 'sine', 0.15)
  else blip(520, 0.07, 'sine', 0.12)
}
function playMiss() {
  blip(180, 0.09, 'sawtooth', 0.08)
}

// ---- 判定 ----
function applyJudge(res, dir) {
  counts.value[res]++
  combo.value++
  if (combo.value > maxCombo.value) maxCombo.value = combo.value
  const base = res === 'perfect' ? 300 : res === 'great' ? 150 : 50
  const mult = 1 + Math.min(combo.value, 100) / 100
  score.value += Math.round(base * mult)
  judgePop.value = res === 'perfect' ? 'Perfect' : res === 'great' ? 'Great' : 'Good'
  judgePopClass.value = res
  judgePopKey.value++
  lastDir.value = dir
  poseUntil.value = nowSec.value + 0.3
  if (res === 'perfect' && combo.value >= 10) {
    spinning.value = true
    setTimeout(() => { spinning.value = false }, 600)
  }
  playHit(res)
}
function onMiss() {
  combo.value = 0
  counts.value.miss++
  judgePop.value = 'Miss'
  judgePopClass.value = 'miss'
  judgePopKey.value++
  playMiss()
}
function hit(dir) {
  if (screen.value !== 'dance' || countdown.value > 0 || songOver.value) return
  ensureAudio()
  const now = nowSec.value
  let best = null
  let bestDt = Infinity
  for (const a of chart.value) {
    if (a.dir !== dir || a.judged) continue
    const dt = Math.abs(a.time - now)
    if (dt <= GOOD_WIN && dt < bestDt) {
      best = a
      bestDt = dt
    }
  }
  if (!best) return
  best.judged = true
  const res = bestDt <= PERFECT_WIN ? 'perfect' : bestDt <= GREAT_WIN ? 'great' : 'good'
  best.result = res
  applyJudge(res, dir)
}

// ---- 主循环 ----
let rafId = 0
let songStartPerf = 0
let nextBeat = 0
let nextHat = BEAT / 2
function loop() {
  if (screen.value !== 'dance' || countdown.value > 0) return
  const now = (performance.now() - songStartPerf) / 1000
  nowSec.value = now
  for (const a of chart.value) {
    if (!a.judged && now - a.time > GOOD_WIN) {
      a.judged = true
      a.result = 'miss'
      onMiss()
    }
  }
  while (nextBeat <= now + 0.05) {
    if (nextBeat >= 0 && nextBeat < songEnd.value) kick()
    nextBeat += BEAT
  }
  while (nextHat <= now + 0.05) {
    if (nextHat >= 0 && nextHat < songEnd.value) blip(7000, 0.03, 'square', 0.04)
    nextHat += BEAT / 2
  }
  if (now >= songEnd.value) {
    finishSong()
    return
  }
  rafId = requestAnimationFrame(loop)
}
function startSong() {
  resetStats()
  songStartPerf = performance.now()
  nowSec.value = 0
  nextBeat = 0
  nextHat = BEAT / 2
  if (mode.value === 'practice') startBots()
  if (mode.value === 'room') startDancePolling()
  rafId = requestAnimationFrame(loop)
}
function resetStats() {
  score.value = 0
  combo.value = 0
  maxCombo.value = 0
  counts.value = { perfect: 0, great: 0, good: 0, miss: 0 }
  judgePop.value = ''
  songOver.value = false
}
let countdownTimer = null
function beginCountdown() {
  if (countdownTimer) return
  if (screen.value !== 'dance') {
    screen.value = 'dance'
    resetStats()
    chart.value = buildChart(mode.value === 'room' ? roomCode.value : 'practice')
  }
  countdown.value = 3
  ensureAudio()
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
      countdown.value = 0
      startSong()
    }
  }, 1000)
}

// ---- 练习机器人 ----
let botTimer = null
function startBots() {
  bots.value = BOT_DEFS.map((b, i) => ({
    userId: 10000 + i,
    name: b.name,
    color: COLORS[(i + 3) % COLORS.length],
    skill: b.skill,
    score: 0,
    maxCombo: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0
  }))
  botTimer = setInterval(() => {
    for (const b of bots.value) {
      b.score += Math.round((300 + Math.random() * 250) * b.skill * (0.8 + Math.random() * 0.4))
      b.maxCombo = Math.max(b.maxCombo, Math.floor(Math.random() * 60 * b.skill))
    }
  }, 500)
}
function finalizeBots() {
  const total = chart.value.length || 1
  for (const b of bots.value) {
    const acc = b.skill
    b.perfect = Math.round(total * acc * 0.7)
    b.great = Math.round(total * acc * 0.25)
    b.good = Math.round(total * (1 - acc) * 0.5)
    b.miss = Math.max(0, total - b.perfect - b.great - b.good)
  }
}

// ---- 房间与轮询 ----
let lobbyTimer = null
let danceTimer = null
let resultsTimer = null
let resultsWaitSec = 0
function clearTimers() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  if (lobbyTimer) { clearInterval(lobbyTimer); lobbyTimer = null }
  if (danceTimer) { clearInterval(danceTimer); danceTimer = null }
  if (resultsTimer) { clearInterval(resultsTimer); resultsTimer = null }
  if (botTimer) { clearInterval(botTimer); botTimer = null }
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
}
async function refreshRoom() {
  if (!roomCode.value) return
  try {
    const data = await getDanceRoom(roomCode.value)
    roomData.value = data
    if (data.status === 'racing' && screen.value === 'lobby') {
      clearInterval(lobbyTimer)
      lobbyTimer = null
      beginCountdown()
    }
    if (screen.value === 'results') {
      resultsWaitSec += 2
      const allDone = (data.players || []).every(p => p.finished)
      if (allDone || resultsWaitSec >= 30) {
        clearInterval(resultsTimer)
        resultsTimer = null
      }
    }
  } catch (e) {
    if (screen.value === 'lobby') {
      ElMessage({ message: t('danceRoomGone'), type: 'warning', plain: true })
      backHome()
    }
  }
}
async function postScoreTick() {
  if (mode.value !== 'room' || !roomCode.value) return
  try {
    await updateDanceScore(roomCode.value, score.value, maxCombo.value, counts.value.perfect, counts.value.great, counts.value.good, counts.value.miss, songOver.value)
  } catch (e) {
    // 轮询上报失败不打扰玩家
  }
  refreshRoom()
}
function startLobbyPolling() {
  clearInterval(lobbyTimer)
  lobbyTimer = setInterval(refreshRoom, 2000)
}
function startDancePolling() {
  clearInterval(danceTimer)
  danceTimer = setInterval(postScoreTick, 1000)
}

async function doCreate() {
  creating.value = true
  try {
    const data = await createDance(myName.value)
    mode.value = 'room'
    roomCode.value = data.code
    screen.value = 'lobby'
    await refreshRoom()
    startLobbyPolling()
  } catch (e) {
    // 服务端报错已由请求拦截器提示
  } finally {
    creating.value = false
  }
}
async function doJoin(code) {
  const c = (code || joinCode.value || '').trim().toUpperCase()
  if (!c) return
  joining.value = true
  try {
    await joinDance(c, myName.value)
    mode.value = 'room'
    roomCode.value = c
    joinCode.value = ''
    screen.value = 'lobby'
    await refreshRoom()
    startLobbyPolling()
  } catch (e) {
    // 服务端报错已由请求拦截器提示
  } finally {
    joining.value = false
  }
}
function startPractice() {
  mode.value = 'practice'
  roomCode.value = ''
  roomData.value = null
  bots.value = []
  beginCountdown()
}
async function doStart() {
  starting.value = true
  try {
    await startDance(roomCode.value)
    clearInterval(lobbyTimer)
    lobbyTimer = null
    beginCountdown()
  } catch (e) {
    // 服务端报错已由请求拦截器提示
  } finally {
    starting.value = false
  }
}
async function finishSong() {
  songOver.value = true
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
  if (mode.value === 'practice') {
    finalizeBots()
  } else {
    try {
      await updateDanceScore(roomCode.value, score.value, maxCombo.value, counts.value.perfect, counts.value.great, counts.value.good, counts.value.miss, true)
    } catch (e) {
      // 忽略
    }
    await refreshRoom()
    resultsWaitSec = 0
    resultsTimer = setInterval(refreshRoom, 2000)
  }
  setTimeout(() => {
    screen.value = 'results'
    clearInterval(danceTimer)
    danceTimer = null
    if (botTimer) { clearInterval(botTimer); botTimer = null }
  }, 800)
}
function copyInvite() {
  const link = location.origin + '/dance?code=' + roomCode.value
  const done = () => ElMessage({ message: t('danceInviteCopied'), type: 'success', plain: true })
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(done).catch(() => fallbackCopy(link, done))
  } else {
    fallbackCopy(link, done)
  }
}
function fallbackCopy(text, done) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    done()
  } catch (e) {
    // 复制失败就不提示了
  }
}
async function doLeave() {
  if (mode.value === 'room' && roomCode.value) {
    try {
      await leaveDance(roomCode.value)
    } catch (e) {
      // 忽略
    }
  }
  backHome()
}
function backHome() {
  clearTimers()
  screen.value = 'home'
  roomCode.value = ''
  roomData.value = null
  countdown.value = 0
  songOver.value = false
}
function playAgain() {
  clearTimers()
  if (mode.value === 'practice') {
    startPractice()
    return
  }
  // 房间没有重开接口：先离房，回到首页重新建房
  ElMessage({ message: t('danceRematchHint'), type: 'info', plain: true })
  doLeave()
}
function onKey(e) {
  if (screen.value !== 'dance') return
  const map = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 }
  if (!(e.key in map)) return
  e.preventDefault()
  if (e.repeat) return
  hit(map[e.key])
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (userStore.refreshUserInfo) userStore.refreshUserInfo()
  const code = (route.query.code || '').toString().trim().toUpperCase()
  if (code) doJoin(code)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearTimers()
  if (audioCtx) {
    try { audioCtx.close() } catch (e) { /* 忽略 */ }
    audioCtx = null
  }
  if (screen.value === 'dance' || screen.value === 'lobby') {
    if (mode.value === 'room' && roomCode.value) {
      leaveDance(roomCode.value).catch(() => {})
    }
  }
})
</script>

<style scoped>
.dance-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 12px 24px;
}
.game-title {
  text-align: center;
  font-size: 32px;
  font-weight: bold;
  margin-top: 12px;
}
.game-sub {
  text-align: center;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin: 6px 0 16px;
}
.howto {
  background: var(--el-fill-color-light);
  border-radius: 10px;
  padding: 14px;
  font-size: 14px;
  line-height: 1.9;
  margin-bottom: 18px;
}
.home-btn {
  display: block;
  width: 100%;
  margin: 10px 0;
}
.join-row {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.lobby-title {
  text-align: center;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-top: 16px;
}
.room-code {
  text-align: center;
  font-size: 44px;
  font-weight: bold;
  letter-spacing: 10px;
  margin: 8px 0;
}
.copy-btn {
  display: block;
  margin: 0 auto 18px;
}
.player-list {
  margin-bottom: 18px;
}
.player-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.player-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}
.player-name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.host-tag,
.me-tag {
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}
.waiting-tip {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 12px 0;
}
.leave-link {
  display: block;
  margin: 8px auto 0;
}
.top-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}
.score-box,
.combo-box {
  text-align: left;
}
.score-label,
.combo-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.score-num {
  font-size: 26px;
  font-weight: bold;
  line-height: 1.1;
}
.combo-num {
  font-size: 26px;
  font-weight: bold;
  line-height: 1.1;
  color: var(--el-color-primary);
}
.combo-box.hot .combo-num {
  color: #f56c6c;
}
.mute-btn {
  margin-left: auto;
}
.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--el-fill-color);
  overflow: hidden;
  margin-bottom: 8px;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #79bbff, #409eff);
  transition: width 0.2s linear;
}
.live-list {
  margin-bottom: 8px;
}
.live-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  padding: 3px 2px;
}
.live-row.me {
  font-weight: bold;
}
.live-name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.live-score {
  font-weight: bold;
}
.finished-tag {
  font-size: 12px;
  color: #67c23a;
}
.stage {
  position: relative;
  height: 420px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(180deg, #a8d8ff 0%, #d6ecff 55%, #f4fbff 100%);
  touch-action: none;
}
.lanes {
  position: absolute;
  inset: 0;
  display: flex;
}
.lane {
  flex: 1;
  position: relative;
  border-left: 1px dashed rgba(255, 255, 255, 0.6);
}
.lane:first-child {
  border-left: none;
}
.lane-1 {
  background: rgba(245, 108, 108, 0.07);
}
.lane-2 {
  background: rgba(230, 162, 60, 0.07);
}
.lane-3 {
  background: rgba(103, 194, 58, 0.07);
}
.lane-4 {
  background: rgba(64, 158, 255, 0.07);
}
.arrow {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  font-weight: bold;
}
.arrow-0 { color: #f56c6c; }
.arrow-1 { color: #e6a23c; }
.arrow-2 { color: #67c23a; }
.arrow-3 { color: #409eff; }
.judge-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 82%;
  height: 3px;
  background: #fff;
  opacity: 0.9;
  box-shadow: 0 0 6px rgba(64, 158, 255, 0.6);
}
.avatar {
  position: absolute;
  left: 50%;
  top: 56%;
  z-index: 5;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: transform 0.12s ease;
}
.avatar-head {
  width: 52px;
  height: 52px;
  margin: 0 auto;
  border-radius: 50%;
  background: #ffe0bd;
  position: relative;
  border: 2px solid rgba(0, 0, 0, 0.08);
}
.avatar-head .eye {
  position: absolute;
  top: 20px;
  width: 7px;
  height: 9px;
  border-radius: 50%;
  background: #333;
}
.avatar-head .eye.left { left: 13px; }
.avatar-head .eye.right { right: 13px; }
.avatar-head .mouth {
  position: absolute;
  left: 50%;
  bottom: 10px;
  width: 16px;
  height: 8px;
  margin-left: -8px;
  border-bottom: 2px solid #333;
  border-radius: 0 0 8px 8px;
}
.avatar-body {
  width: 44px;
  height: 44px;
  margin: -4px auto 0;
  border-radius: 14px 14px 8px 8px;
  background: var(--avatar-color, #409eff);
}
.avatar-feet {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 2px;
}
.avatar-feet span {
  width: 18px;
  height: 6px;
  border-radius: 3px;
  background: #8a6d4b;
}
.avatar.pose-0 { transform: translate(-50%, -50%) rotate(-18deg) translateX(-8px); }
.avatar.pose-1 { transform: translate(-50%, -50%) translateY(8px) scaleY(0.92); }
.avatar.pose-2 { transform: translate(-50%, -50%) translateY(-12px); }
.avatar.pose-3 { transform: translate(-50%, -50%) rotate(18deg) translateX(8px); }
.avatar.spinning .avatar-body {
  animation: spin360 0.5s ease;
}
@keyframes spin360 {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.judge-pop {
  position: absolute;
  left: 50%;
  top: 30%;
  transform: translate(-50%, -50%);
  font-size: 30px;
  font-weight: bold;
  pointer-events: none;
  animation: popfade 0.45s ease forwards;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
.pop-perfect { color: #f5b301; }
.pop-great { color: #67c23a; }
.pop-good { color: #409eff; }
.pop-miss { color: #909399; }
@keyframes popfade {
  0% { opacity: 1; transform: translate(-50%, -50%) scale(1.25); }
  100% { opacity: 0; transform: translate(-50%, -70%) scale(1); }
}
.countdown {
  position: absolute;
  left: 50%;
  top: 42%;
  transform: translate(-50%, -50%);
  font-size: 96px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 4px 16px rgba(64, 158, 255, 0.6);
  pointer-events: none;
}
.countdown.small {
  font-size: 28px;
}
.pad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.pad-btn {
  height: 64px;
  border: none;
  border-radius: 12px;
  font-size: 30px;
  font-weight: bold;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.pad-btn:active {
  transform: scale(0.94);
  background: var(--el-fill-color);
}
.pad-0 { color: #f56c6c; }
.pad-1 { color: #e6a23c; }
.pad-2 { color: #67c23a; }
.pad-3 { color: #409eff; }
.pad-hint {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}
.results-title {
  text-align: center;
  font-size: 26px;
  font-weight: bold;
  margin: 12px 0;
}
.rank-list {
  margin-bottom: 16px;
}
.rank-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.rank-row.me {
  font-weight: bold;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}
.rank-no {
  width: 22px;
  text-align: center;
  font-weight: bold;
}
.rank-name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.rank-score {
  font-weight: bold;
}
.my-stats {
  background: var(--el-fill-color-light);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 16px;
}
.stats-title {
  text-align: center;
  font-weight: bold;
  margin-bottom: 10px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  text-align: center;
  margin-bottom: 8px;
}
.stats-num {
  font-size: 22px;
  font-weight: bold;
}
.stats-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.judge-counts {
  display: flex;
  justify-content: center;
  gap: 12px;
  font-size: 13px;
  flex-wrap: wrap;
}
.c-perfect { color: #f5b301; }
.c-great { color: #67c23a; }
.c-good { color: #409eff; }
.c-miss { color: #909399; }
</style>
