<template>
  <div class="piano-page">
    <button class="exit-btn" type="button" @click="exitGame" aria-label="close">✕</button>
    <!-- 首页：选曲 + 建房 / 进房 / 练习 / 自由弹 -->
    <div v-if="screen === 'home'" class="home">
      <div class="game-title">🎹 {{ $t('piano') }}</div>
      <div class="game-sub">{{ $t('pianoSub') }}</div>
      <div class="howto">
        <div>🎵 {{ $t('pianoHow1') }}</div>
        <div>⭐ {{ $t('pianoHow2') }}</div>
        <div>🔥 {{ $t('pianoHow3') }}</div>
        <div>👯 {{ $t('pianoHow4') }}</div>
      </div>
      <div class="song-picker-title">{{ $t('pianoChooseSong') }}</div>
      <div class="song-grid">
        <div
          v-for="s in songList"
          :key="s.id"
          class="song-card"
          :class="{ selected: selectedSongId === s.id }"
          @click="selectedSongId = s.id"
        >
          <div class="song-name">{{ $t(s.nameKey) }}<span v-if="selectedSongId === s.id" class="song-check"> ✓</span></div>
          <div class="song-meta">{{ $t('pianoSongMeta', { notes: s.notes.length, secs: songSecs(s) }) }}</div>
        </div>
      </div>
      <el-button v-if="dmFriendId" type="primary" size="large" class="home-btn" :loading="creating" @click="invitePiano">🎹 {{ $t('pianoInviteFriend') }}</el-button>
      <el-button type="primary" size="large" class="home-btn" :loading="creating" @click="doCreate">{{ $t('pianoCreateRoom') }}</el-button>
      <div class="join-row">
        <el-input v-model="joinCode" :placeholder="$t('pianoEnterCode')" maxlength="6" clearable @keyup.enter="doJoin" />
        <el-button :loading="joining" @click="doJoin">{{ $t('pianoJoinRoom') }}</el-button>
      </div>
      <el-button size="large" class="home-btn" @click="startPractice">{{ $t('pianoPractice') }}</el-button>
      <el-button size="large" class="home-btn" @click="startFreePlay">{{ $t('pianoFreePlay') }}</el-button>
    </div>

    <!-- 大厅 -->
    <div v-else-if="screen === 'lobby'" class="lobby">
      <div class="lobby-title">{{ $t('pianoRoomCode') }}</div>
      <div class="room-code">{{ roomCode }}</div>
      <div class="lobby-song">🎵 {{ songName(currentSongId) }}</div>
      <el-button class="copy-btn" @click="copyInvite">{{ $t('pianoCopyInvite') }}</el-button>
      <div class="player-list">
        <div v-for="p in roomPlayers" :key="p.userId" class="player-row">
          <span class="player-dot" :style="{ background: playerColor(p.userId) }"></span>
          <span class="player-name">{{ p.name || p.email || $t('pianoYou') }}</span>
          <span v-if="p.userId === roomData?.hostUserId" class="host-tag">{{ $t('pianoHost') }}</span>
          <span v-if="p.userId === myId" class="me-tag">{{ $t('pianoYou') }}</span>
        </div>
        <el-empty v-if="!roomPlayers.length" :description="$t('pianoNoPlayers')" />
      </div>
      <el-button v-if="isHost" type="primary" size="large" class="home-btn" :loading="starting" @click="doStart">{{ $t('pianoStart') }}</el-button>
      <div v-else class="waiting-tip">{{ $t('pianoWaitingHost') }}</div>
      <el-button link class="leave-link" @click="doLeave">{{ $t('pianoLeave') }}</el-button>
    </div>

    <!-- 弹琴 -->
    <div v-else-if="screen === 'play'" class="play">
      <div class="top-bar">
        <div class="score-box">
          <div class="score-label">{{ $t('pianoScore') }}</div>
          <div class="score-num">{{ score }}</div>
        </div>
        <div class="combo-box" :class="{ hot: combo >= 10 }">
          <div class="combo-label">{{ $t('pianoCombo') }}</div>
          <div class="combo-num">{{ combo }}</div>
        </div>
        <div class="song-chip">{{ songName(currentSongId) }}</div>
        <el-button link class="mute-btn" @click="muted = !muted">{{ muted ? $t('pianoMuted') : $t('pianoMusic') }}</el-button>
      </div>
      <div class="progress-bar"><div class="progress-fill" :style="{ width: songProgress + '%' }"></div></div>
      <div class="live-list">
        <div v-for="p in livePlayers" :key="p.userId" class="live-row" :class="{ me: p.userId === myId }">
          <span class="player-dot" :style="{ background: p.color }"></span>
          <span class="live-name">{{ p.name }}</span>
          <span class="live-score">{{ p.score }}</span>
          <span v-if="p.finished" class="finished-tag">{{ $t('pianoFinished') }}</span>
        </div>
      </div>
      <div class="stage">
        <div class="lanes-wrap" @pointerdown="onStageTap">
          <div class="lanes">
            <div v-for="lane in 8" :key="lane" class="lane" :class="'lane-' + lane">
              <div
                v-for="note in visibleNotes(lane - 1)"
                :key="note.time + '-' + note.lane"
                class="note"
                :style="{ top: noteTop(note) + '%', background: LANE_COLORS[note.lane] }"
              >{{ NOTE_NAMES[note.lane] }}</div>
            </div>
          </div>
          <div class="judge-line"></div>
          <div v-if="judgePop" :key="judgePopKey" class="judge-pop" :class="'pop-' + judgePopClass">{{ judgePop }}</div>
          <div v-if="countdown > 0" class="countdown">{{ countdown }}</div>
          <div v-if="countdown === 0 && songOver" class="countdown small">{{ $t('pianoDone') }}</div>
        </div>
        <div class="keyboard">
          <div class="black-keys" aria-hidden="true">
            <span v-for="b in BLACK_KEY_POS" :key="b" :style="{ left: b + '%' }"></span>
          </div>
          <button
            v-for="lane in 8"
            :key="lane"
            class="white-key"
            :class="{ active: keyDown[lane - 1] }"
            type="button"
            @pointerdown.prevent="hit(lane - 1)"
          >
            <span class="key-name">{{ NOTE_NAMES[lane - 1] }}</span>
            <span class="key-letter">{{ KEY_LETTERS[lane - 1] }}</span>
            <span class="key-hint">{{ KEY_HINTS[lane - 1] }}</span>
          </button>
        </div>
      </div>
      <div class="pad-hint">{{ $t('pianoKeyboardHint') }}</div>
    </div>

    <!-- 自由弹琴 -->
    <div v-else-if="screen === 'free'" class="free">
      <div class="game-title small">🎹 {{ $t('pianoFreePlay') }}</div>
      <div class="free-hint">{{ $t('pianoFreePlayHint') }}</div>
      <div class="stage free-stage">
        <div class="keyboard big">
          <div class="black-keys" aria-hidden="true">
            <span v-for="b in BLACK_KEY_POS" :key="b" :style="{ left: b + '%' }"></span>
          </div>
          <button
            v-for="lane in 8"
            :key="lane"
            class="white-key"
            :class="{ active: keyDown[lane - 1] }"
            type="button"
            @pointerdown.prevent="hit(lane - 1)"
          >
            <span class="key-name">{{ NOTE_NAMES[lane - 1] }}</span>
            <span class="key-letter">{{ KEY_LETTERS[lane - 1] }}</span>
            <span class="key-hint">{{ KEY_HINTS[lane - 1] }}</span>
          </button>
        </div>
      </div>
      <el-button size="large" class="home-btn" @click="backHome">{{ $t('pianoBack') }}</el-button>
    </div>

    <!-- 结算 -->
    <div v-else-if="screen === 'results'" class="results">
      <div class="results-title">🏆 {{ $t('pianoRanking') }}</div>
      <div class="rank-list">
        <div v-for="(p, i) in rankedPlayers" :key="p.userId" class="rank-row" :class="{ me: p.userId === myId }">
          <span class="rank-no">{{ i + 1 }}</span>
          <span class="player-dot" :style="{ background: p.color }"></span>
          <span class="rank-name">{{ p.name }}</span>
          <span class="rank-score">{{ p.score }}</span>
        </div>
      </div>
      <div class="my-stats">
        <div class="stats-title">{{ $t('pianoMyStats', { grade: myGrade }) }}</div>
        <div class="stats-grid">
          <div><div class="stats-num">{{ score }}</div><div class="stats-label">{{ $t('pianoScore') }}</div></div>
          <div><div class="stats-num">{{ myAccuracy }}%</div><div class="stats-label">{{ $t('pianoAccuracy') }}</div></div>
          <div><div class="stats-num">{{ maxCombo }}</div><div class="stats-label">{{ $t('pianoMaxCombo') }}</div></div>
        </div>
        <div class="judge-counts">
          <span class="c-perfect">Perfect {{ counts.perfect }}</span>
          <span class="c-great">Great {{ counts.great }}</span>
          <span class="c-good">Good {{ counts.good }}</span>
          <span class="c-miss">Miss {{ counts.miss }}</span>
        </div>
      </div>
      <el-button type="primary" size="large" class="home-btn" @click="playAgain">{{ $t('pianoPlayAgain') }}</el-button>
      <el-button size="large" class="home-btn" @click="backHome">{{ $t('pianoBack') }}</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user.js'
import { createDance, joinDance, getDanceRoom, startDance, updateDanceScore, leaveDance } from '@/request/dance.js'
import { sendMessage } from '@/request/dm.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// ---- 钢琴：8 个白键 C4–C5 ----
const FREQS = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25]
const NOTE_NAMES = ['哆', '来', '咪', '发', '索', '拉', '西', '哆']
const KEY_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']
const KEY_HINTS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K']
const LANE_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac']
const BLACK_KEY_POS = [12.5, 25, 50, 62.5, 75]
const KEY_MAP = { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4, KeyH: 5, KeyJ: 6, KeyK: 7 }
const TRAVEL = 1.8
const PERFECT_WIN = 0.06
const GREAT_WIN = 0.12
const GOOD_WIN = 0.2
const JUDGE_LINE = 82
const COLORS = ['#f56c6c', '#e6a23c', '#67c23a', '#409eff', '#b37feb', '#ff85c0', '#13c2c2', '#ff7a45']
const BOT_DEFS = [
  { name: '小琴', skill: 0.72 },
  { name: '阿键', skill: 0.84 },
  { name: '豆豆', skill: 0.93 }
]

// ---- 曲谱：每条 [lane, beats]，顺序旋律；beatSec = 60 / bpm ----
const SONGS = {
  twinkle: { id: 'twinkle', nameKey: 'pianoSongTwinkle', bpm: 100, notes: [[0, 1], [0, 1], [4, 1], [4, 1], [5, 1], [5, 1], [4, 2], [3, 1], [3, 1], [2, 1], [2, 1], [1, 1], [1, 1], [0, 2], [4, 1], [4, 1], [3, 1], [3, 1], [2, 1], [2, 1], [1, 2], [4, 1], [4, 1], [3, 1], [3, 1], [2, 1], [2, 1], [1, 2], [0, 1], [0, 1], [4, 1], [4, 1], [5, 1], [5, 1], [4, 2], [3, 1], [3, 1], [2, 1], [2, 1], [1, 1], [1, 1], [0, 2]] },
  ode: { id: 'ode', nameKey: 'pianoSongOde', bpm: 112, notes: [[2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [2, 1], [1, 2], [2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [1, 1], [0, 2], [2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [1, 1], [0, 2]] },
  tiger: { id: 'tiger', nameKey: 'pianoSongTiger', bpm: 112, notes: [[0, 1], [1, 1], [2, 1], [0, 1], [0, 1], [1, 1], [2, 1], [0, 1], [2, 1], [3, 1], [4, 2], [2, 1], [3, 1], [4, 2], [4, 1], [5, 1], [4, 1], [3, 1], [2, 1], [0, 1], [4, 1], [5, 1], [4, 1], [3, 1], [2, 1], [0, 1], [0, 1], [4, 1], [0, 2], [0, 1], [4, 1], [0, 2]] },
  jingle: { id: 'jingle', nameKey: 'pianoSongJingle', bpm: 120, notes: [[2, 1], [2, 1], [2, 2], [2, 1], [2, 1], [2, 2], [2, 1], [4, 1], [0, 1], [1, 1], [2, 4], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [2, 1], [2, 1], [2, 1], [2, 1], [1, 1], [1, 1], [2, 1], [1, 1], [4, 2]] }
}
const songList = Object.values(SONGS)

const screen = ref('home') // home | lobby | play | results | free
const mode = ref('room') // room | practice | free
const selectedSongId = ref('twinkle')
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
// 从私信里的 + 号进来的：带上好友 userId，首页会出现“邀请好友一起弹”
const dmFriendId = computed(() => Number(route.query.dm) || 0)
const myName = computed(() => userStore.user?.name || (userStore.user?.email || '').split('@')[0] || t('pianoYou'))
const myColor = computed(() => playerColor(myId.value))
const isHost = computed(() => !!roomData.value && roomData.value.hostUserId === myId.value)
const roomPlayers = computed(() => roomData.value?.players || [])
// 房间里所有人弹同一首：房主建房时选的曲子存在房间里，进房的人读房间的 song
const currentSongId = computed(() => {
  if (mode.value === 'room' && roomData.value?.song && SONGS[roomData.value.song]) return roomData.value.song
  return selectedSongId.value
})
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
const keyDown = ref(Array(8).fill(false))
const bots = ref([])

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
    name: p.name || p.email || t('pianoYou'),
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
      return { userId: p.userId, name: p.name || p.email || t('pianoYou'), color: playerColor(p.userId), score: score.value, perfect: counts.value.perfect, great: counts.value.great, good: counts.value.good, miss: counts.value.miss, maxCombo: maxCombo.value }
    }
    return { userId: p.userId, name: p.name || p.email || t('pianoYou'), color: playerColor(p.userId), score: p.score, perfect: p.perfect, great: p.great, good: p.good, miss: p.miss, maxCombo: p.maxCombo }
  })
  if (!list.some(p => p.userId === myId.value)) {
    list.push({ userId: myId.value, name: myName.value, color: myColor.value, score: score.value, perfect: counts.value.perfect, great: counts.value.great, good: counts.value.good, miss: counts.value.miss, maxCombo: maxCombo.value })
  }
  return list.sort((a, b) => b.score - a.score)
})

function playerColor(userId) {
  return COLORS[Math.abs(Number(userId) || 0) % COLORS.length]
}
function songName(id) {
  const song = SONGS[id]
  return t(song ? song.nameKey : 'pianoSongTwinkle')
}
function songSecs(song) {
  const beats = song.notes.reduce((a, n) => a + n[1], 0)
  return Math.round((beats * 60) / song.bpm)
}

// ---- 曲谱：同一首曲子所有人音符时间完全相同 ----
function buildChart(songId) {
  const song = SONGS[songId] || SONGS.twinkle
  const beatSec = 60 / song.bpm
  const list = []
  let time = 0
  for (const [lane, beats] of song.notes) {
    list.push({ time, lane, judged: false, result: '' })
    time += beats * beatSec
  }
  return list
}
function visibleNotes(lane) {
  const now = nowSec.value
  return chart.value.filter(n => n.lane === lane && !n.judged && (n.time - now) <= TRAVEL && (n.time - now) >= -0.25)
}
function noteTop(note) {
  const remain = note.time - nowSec.value
  return Math.max(0, JUDGE_LINE * (1 - remain / TRAVEL))
}

// ---- WebAudio 钢琴音色（无外部音频文件，失败就静音玩） ----
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
function playNote(lane) {
  if (!audioCtx || muted.value) return
  try {
    const freq = FREQS[lane]
    const t0 = audioCtx.currentTime
    const osc = audioCtx.createOscillator()
    const osc2 = audioCtx.createOscillator()
    const g2 = audioCtx.createGain()
    const gain = audioCtx.createGain()
    const filter = audioCtx.createBiquadFilter()
    osc.type = 'triangle'
    osc.frequency.value = freq
    osc2.type = 'sine'
    osc2.frequency.value = freq * 2
    g2.gain.value = 0.25
    filter.type = 'lowpass'
    filter.frequency.value = 2200
    gain.gain.setValueAtTime(0.28, t0)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9)
    osc.connect(gain)
    osc2.connect(g2)
    g2.connect(gain)
    gain.connect(filter)
    filter.connect(masterGain)
    osc.start(t0)
    osc2.start(t0)
    osc.stop(t0 + 0.95)
    osc2.stop(t0 + 0.95)
  } catch (e) {
    // 忽略
  }
}
function playMiss() {
  if (!audioCtx || muted.value) return
  try {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = 160
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09)
    osc.connect(gain)
    gain.connect(masterGain)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.1)
  } catch (e) {
    // 忽略
  }
}

// ---- 判定 ----
function applyJudge(res) {
  counts.value[res]++
  combo.value++
  if (combo.value > maxCombo.value) maxCombo.value = combo.value
  const base = res === 'perfect' ? 300 : res === 'great' ? 150 : 50
  const mult = 1 + Math.min(combo.value, 20) * 0.05
  score.value += Math.round(base * mult)
  judgePop.value = res === 'perfect' ? 'Perfect' : res === 'great' ? 'Great' : 'Good'
  judgePopClass.value = res
  judgePopKey.value++
}
function onMiss() {
  combo.value = 0
  counts.value.miss++
  judgePop.value = 'Miss'
  judgePopClass.value = 'miss'
  judgePopKey.value++
  playMiss()
}
function setKeyDown(lane, val) {
  keyDown.value[lane] = val
}
function hit(lane) {
  ensureAudio()
  playNote(lane)
  setKeyDown(lane, true)
  setTimeout(() => setKeyDown(lane, false), 160)
  // 自由弹琴：只发声，不判定、不计分
  if (screen.value === 'free') return
  if (screen.value !== 'play' || countdown.value > 0 || songOver.value) return
  const now = nowSec.value
  let best = null
  let bestDt = Infinity
  for (const n of chart.value) {
    if (n.lane !== lane || n.judged) continue
    const dt = Math.abs(n.time - now)
    if (dt <= GOOD_WIN && dt < bestDt) {
      best = n
      bestDt = dt
    }
  }
  if (!best) return
  best.judged = true
  const res = bestDt <= PERFECT_WIN ? 'perfect' : bestDt <= GREAT_WIN ? 'great' : 'good'
  best.result = res
  applyJudge(res)
}
// 点下落的音符：按横坐标换算成对应的琴键
function onStageTap(e) {
  if (screen.value !== 'play') return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const lane = Math.max(0, Math.min(7, Math.floor((x / rect.width) * 8)))
  hit(lane)
}

// ---- 主循环 ----
let rafId = 0
let songStartPerf = 0
function loop() {
  if (screen.value !== 'play' || countdown.value > 0) return
  const now = (performance.now() - songStartPerf) / 1000
  nowSec.value = now
  for (const n of chart.value) {
    if (!n.judged && now - n.time > GOOD_WIN) {
      n.judged = true
      n.result = 'miss'
      onMiss()
    }
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
  if (mode.value === 'practice') startBots()
  if (mode.value === 'room') startRoomPolling()
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
  if (screen.value !== 'play') {
    screen.value = 'play'
    resetStats()
    chart.value = buildChart(currentSongId.value)
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
let scoreTimer = null
let playRoomTimer = null
let resultsTimer = null
let resultsWaitSec = 0
function clearTimers() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  if (lobbyTimer) { clearInterval(lobbyTimer); lobbyTimer = null }
  if (scoreTimer) { clearInterval(scoreTimer); scoreTimer = null }
  if (playRoomTimer) { clearInterval(playRoomTimer); playRoomTimer = null }
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
      ElMessage({ message: t('pianoRoomGone'), type: 'warning', plain: true })
      backHome()
    }
  }
}
async function postScore() {
  if (mode.value !== 'room' || !roomCode.value) return
  try {
    await updateDanceScore(roomCode.value, score.value, maxCombo.value, counts.value.perfect, counts.value.great, counts.value.good, counts.value.miss, songOver.value)
  } catch (e) {
    // 轮询上报失败不打扰玩家
  }
}
function startLobbyPolling() {
  clearInterval(lobbyTimer)
  lobbyTimer = setInterval(refreshRoom, 2000)
}
function startRoomPolling() {
  clearInterval(scoreTimer)
  clearInterval(playRoomTimer)
  scoreTimer = setInterval(postScore, 500)
  playRoomTimer = setInterval(refreshRoom, 1000)
}

async function doCreate() {
  creating.value = true
  try {
    const data = await createDance(myName.value, selectedSongId.value)
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
// 从私信邀请：建房后把邀请链接直接发给那个好友，再进大厅等他
async function invitePiano() {
  if (!dmFriendId.value) return
  creating.value = true
  try {
    const data = await createDance(myName.value, selectedSongId.value)
    const link = location.origin + '/piano?code=' + data.code
    await sendMessage(dmFriendId.value, t('pianoInviteMsg', { link }))
    ElMessage({ message: t('pianoInviteSent'), type: 'success', plain: true })
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
function startFreePlay() {
  mode.value = 'free'
  roomCode.value = ''
  roomData.value = null
  screen.value = 'free'
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
    clearInterval(scoreTimer)
    scoreTimer = null
    clearInterval(playRoomTimer)
    playRoomTimer = null
    if (botTimer) { clearInterval(botTimer); botTimer = null }
  }, 800)
}
function copyInvite() {
  const link = location.origin + '/piano?code=' + roomCode.value
  const done = () => ElMessage({ message: t('pianoInviteCopied'), type: 'success', plain: true })
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
// 右上角 ✕：先离房（在房间里就退掉房间），再退出游戏回上一页
function exitGame() {
  if (screen.value !== 'home') doLeave()
  if (window.history.length > 1) router.back()
  else router.push({ name: 'email' })
}
function playAgain() {
  clearTimers()
  if (mode.value === 'practice') {
    startPractice()
    return
  }
  // 房间没有重开接口：先离房，回到首页重新建房
  ElMessage({ message: t('pianoRematchHint'), type: 'info', plain: true })
  doLeave()
}
function onKey(e) {
  if (screen.value !== 'play' && screen.value !== 'free') return
  if (!(e.code in KEY_MAP)) return
  e.preventDefault()
  if (e.repeat) return
  hit(KEY_MAP[e.code])
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
  if (screen.value === 'play' || screen.value === 'lobby') {
    if (mode.value === 'room' && roomCode.value) {
      leaveDance(roomCode.value).catch(() => {})
    }
  }
})
</script>

<style scoped>
.piano-page {
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 12px 24px;
  min-height: 100dvh;
  box-sizing: border-box;
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
  z-index: 50;
}
.game-title {
  text-align: center;
  font-size: 32px;
  font-weight: bold;
  margin-top: 12px;
}
.game-title.small {
  font-size: 24px;
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
.song-picker-title {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 8px;
}
.song-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}
.song-card {
  border: 2px solid var(--el-border-color);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  background: var(--el-bg-color);
}
.song-card.selected {
  border-color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}
.song-name {
  font-size: 16px;
  font-weight: bold;
}
.song-check {
  color: var(--el-color-primary);
}
.song-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
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
.lobby-song {
  text-align: center;
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 12px;
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
  padding-right: 48px;
  box-sizing: border-box;
}
.score-box,
.combo-box {
  text-align: left;
  flex-shrink: 0;
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
.song-chip {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 14px;
  font-weight: bold;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mute-btn {
  margin-left: auto;
  flex-shrink: 0;
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
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(180deg, #14142b 0%, #1e2a4a 60%, #24365e 100%);
  display: flex;
  flex-direction: column;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.lanes-wrap {
  position: relative;
  height: 340px;
  flex: none;
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
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}
.lane:first-child {
  border-left: none;
}
.lane-1 { background: rgba(255, 107, 107, 0.06); }
.lane-2 { background: rgba(255, 169, 77, 0.06); }
.lane-3 { background: rgba(255, 212, 59, 0.06); }
.lane-4 { background: rgba(105, 219, 124, 0.06); }
.lane-5 { background: rgba(56, 217, 169, 0.06); }
.lane-6 { background: rgba(77, 171, 247, 0.06); }
.lane-7 { background: rgba(151, 117, 250, 0.06); }
.lane-8 { background: rgba(247, 131, 172, 0.06); }
.note {
  position: absolute;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 84%;
  height: 46px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.judge-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 82%;
  height: 3px;
  background: #fff;
  opacity: 0.9;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  pointer-events: none;
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
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}
.pop-perfect { color: #ffd43b; }
.pop-great { color: #69db7c; }
.pop-good { color: #4dabf7; }
.pop-miss { color: #adb5bd; }
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
  text-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.countdown.small {
  font-size: 28px;
}
.keyboard {
  position: relative;
  display: flex;
  height: 92px;
  flex: none;
  background: #111;
  touch-action: none;
}
.keyboard.big {
  height: 190px;
}
.black-keys {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.black-keys span {
  position: absolute;
  top: 0;
  width: 7%;
  height: 55%;
  margin-left: -3.5%;
  background: #222;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 3px 5px rgba(0, 0, 0, 0.5);
}
.white-key {
  flex: 1;
  min-width: 0;
  border: 1px solid #999;
  border-top: 2px solid #333;
  background: #fff;
  color: #333;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 6px;
  gap: 1px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.white-key:first-child {
  border-left: none;
}
.white-key:last-child {
  border-right: none;
}
.white-key.active {
  background: #ffe066;
  transform: translateY(2px);
}
.keyboard.big .white-key.active {
  background: #ffe066;
}
.key-name {
  font-size: 16px;
  font-weight: bold;
  line-height: 1;
}
.keyboard.big .key-name {
  font-size: 22px;
}
.key-letter {
  font-size: 11px;
  color: #888;
  line-height: 1.2;
}
.key-hint {
  font-size: 10px;
  color: #aaa;
  line-height: 1.2;
}
.free-hint {
  text-align: center;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}
.free-stage {
  margin-bottom: 18px;
}
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
