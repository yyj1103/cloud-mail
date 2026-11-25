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

    <!-- 弹琴：钢琴块 2 式，4 轨黑块下落 -->
    <div v-else-if="screen === 'play'" class="play">
      <div class="play-stage">
        <canvas ref="bgCanvasRef" class="bg-canvas"></canvas>
        <div class="hud-combo">{{ combo }}</div>
        <div class="hud-score">{{ fmtScore }}</div>
        <button class="pause-btn" type="button" @click="togglePause">II</button>
        <div v-if="portraitHint" class="rotate-hint" @click="portraitHint = false">横过来玩更爽</div>
        <div class="lanes-wrap" @pointerdown="onStageTap" @pointerup="onStagePointerUp" @pointercancel="onStagePointerUp">
          <div class="lanes">
            <div v-for="lane in 4" :key="lane" class="lane">
              <div
                v-for="note in visibleNotes(lane - 1)"
                :key="note.time + '-' + note.lane"
                class="tile"
                :class="{ hold: note.isHold, holding: note.holding }"
                :style="tileStyle(note)"
              ></div>
              <div v-if="flashKey[lane - 1] > 0" class="lane-flash" :key="'f' + lane + '-' + flashKey[lane - 1]"></div>
            </div>
          </div>
          <div class="hit-zone"></div>
          <div v-for="f in floats" :key="f.id" class="float-num" :style="{ left: (f.lane * 25 + 12.5) + '%' }">+{{ f.val }}</div>
          <div v-if="countdown > 0" class="countdown">{{ countdown }}</div>
          <div v-if="countdown === 0 && songOver" class="countdown small">{{ $t('pianoDone') }}</div>
          <div v-if="paused" class="pause-overlay">
            <div class="pause-title">已暂停</div>
            <el-button type="primary" size="large" @click="togglePause">继续</el-button>
            <el-button size="large" @click="muted = !muted">{{ muted ? '🔇 音乐关' : '🔊 音乐开' }}</el-button>
          </div>
        </div>
        <div class="bottom-bar">
          <span class="song-name">{{ songName(currentSongId) }}</span>
          <span class="diff-label">Lv.{{ songLevel }}</span>
        </div>
      </div>
    </div>

    <!-- 自由弹琴 -->
    <div v-else-if="screen === 'free'" class="free">
      <div class="game-title small">🎹 {{ $t('pianoFreePlay') }}</div>
      <div class="free-hint">{{ $t('pianoFreePlayHint') }}</div>
      <div class="free-lanes">
        <button
          v-for="lane in 4"
          :key="lane"
          class="free-lane"
          :class="{ active: keyDown[lane - 1] }"
          type="button"
          @pointerdown.prevent="hit(lane - 1)"
        >{{ NOTE_NAMES[lane - 1] }}</button>
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

// ---- 钢琴块 2 式：4 轨，C 大调琶音 C4 E4 G4 C5 ----
const FREQS = [261.63, 329.63, 392.0, 523.25]
const NOTE_NAMES = ['哆', '咪', '索', '哆']
const KEY_MAP = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 }
const TRAVEL = 1.8
const PERFECT_WIN = 0.06
const GREAT_WIN = 0.12
const GOOD_WIN = 0.2
const JUDGE_LINE = 88
const HOLD_TICK_SCORE = 10
const COLORS = ['#f56c6c', '#e6a23c', '#67c23a', '#409eff', '#b37feb', '#ff85c0', '#13c2c2', '#ff7a45']
const BOT_DEFS = [
  { name: '小琴', skill: 0.72 },
  { name: '阿键', skill: 0.84 },
  { name: '豆豆', skill: 0.93 }
]

// ---- 曲谱：每条 [lane, beats]，顺序旋律；beatSec = 60 / bpm ----
const SONGS = {
  twinkle: { id: 'twinkle', nameKey: 'pianoSongTwinkle', bpm: 100, level: 8, notes: [[0, 1], [0, 1], [0, 1], [0, 1], [1, 1], [1, 1], [0, 2], [3, 1], [3, 1], [2, 1], [2, 1], [1, 1], [1, 1], [0, 2], [0, 1], [0, 1], [3, 1], [3, 1], [2, 1], [2, 1], [1, 2], [0, 1], [0, 1], [3, 1], [3, 1], [2, 1], [2, 1], [1, 2], [0, 1], [0, 1], [0, 1], [0, 1], [1, 1], [1, 1], [0, 2], [3, 1], [3, 1], [2, 1], [2, 1], [1, 1], [1, 1], [0, 2]] },
  ode: { id: 'ode', nameKey: 'pianoSongOde', bpm: 112, level: 9, notes: [[2, 1], [2, 1], [3, 1], [0, 1], [0, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [2, 1], [1, 2], [2, 1], [2, 1], [3, 1], [0, 1], [0, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [1, 1], [0, 2], [2, 1], [2, 1], [3, 1], [0, 1], [0, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1], [1, 1], [0, 2]] },
  tiger: { id: 'tiger', nameKey: 'pianoSongTiger', bpm: 112, level: 9, notes: [[0, 1], [1, 1], [2, 1], [0, 1], [0, 1], [1, 1], [2, 1], [0, 1], [2, 1], [3, 1], [0, 2], [2, 1], [3, 1], [0, 2], [0, 1], [1, 1], [0, 1], [3, 1], [2, 1], [0, 1], [0, 1], [1, 1], [0, 1], [3, 1], [2, 1], [0, 1], [0, 1], [0, 1], [0, 2], [0, 1], [0, 1], [0, 2]] },
  jingle: { id: 'jingle', nameKey: 'pianoSongJingle', bpm: 120, level: 10, notes: [[2, 1], [2, 1], [2, 2], [2, 1], [2, 1], [2, 2], [2, 1], [0, 1], [0, 1], [1, 1], [2, 4], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [2, 1], [2, 1], [2, 1], [2, 1], [1, 1], [1, 1], [2, 1], [1, 1], [0, 2]] }
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
const songEnd = computed(() => (chart.value.length ? Math.max(...chart.value.map(n => n.end)) : 0) + 1.2)

const chart = ref([])
const nowSec = ref(0)
const score = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const counts = ref({ perfect: 0, great: 0, good: 0, miss: 0 })
const keyDown = ref(Array(4).fill(false))
const bots = ref([])
const paused = ref(false)
const portraitHint = ref(false)
const floats = ref([])
const flashKey = ref([0, 0, 0, 0])
const bgCanvasRef = ref(null)
let floatId = 0
const fmtScore = computed(() => String(score.value).padStart(7, '0'))
const songLevel = computed(() => (SONGS[currentSongId.value] || SONGS.twinkle).level || 8)

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
    const len = beats * beatSec
    list.push({ time, end: time + len, len, lane, isHold: beats >= 2, judged: false, holding: false, result: '', lastTick: 0, pointerId: null })
    time += len
  }
  return list
}
function visibleNotes(lane) {
  const now = nowSec.value
  return chart.value.filter(n => n.lane === lane && !n.judged && (n.time - now) <= TRAVEL && (n.end - now) >= -0.25)
}
// 黑块位置：普通块按头算，长音块按中点算、高度按音长算
function tileStyle(note) {
  const now = nowSec.value
  if (note.isHold) {
    const mid = note.time + note.len / 2
    const top = JUDGE_LINE * (1 - (mid - now) / TRAVEL)
    const h = (note.len / TRAVEL) * JUDGE_LINE
    return { top: Math.max(0, top) + '%', height: h + '%' }
  }
  const remain = note.time - now
  return { top: Math.max(0, JUDGE_LINE * (1 - remain / TRAVEL)) + '%', height: '46px' }
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
  const gained = Math.round(base * mult)
  score.value += gained
  return gained
}
function onMiss() {
  combo.value = 0
  counts.value.miss++
  playMiss()
}
function setKeyDown(lane, val) {
  keyDown.value[lane] = val
}
function hit(lane, pointerId) {
  ensureAudio()
  playNote(lane)
  setKeyDown(lane, true)
  setTimeout(() => setKeyDown(lane, false), 160)
  flashKey.value[lane]++
  // 自由弹琴：只发声，不判定、不计分
  if (screen.value === 'free') return
  if (screen.value !== 'play' || countdown.value > 0 || songOver.value || paused.value) return
  const now = nowSec.value
  let best = null
  let bestDt = Infinity
  for (const n of chart.value) {
    if (n.lane !== lane || n.judged || n.holding) continue
    const dt = Math.abs(n.time - now)
    if (dt <= GOOD_WIN && dt < bestDt) {
      best = n
      bestDt = dt
    }
  }
  if (!best) return
  const res = bestDt <= PERFECT_WIN ? 'perfect' : bestDt <= GREAT_WIN ? 'great' : 'good'
  best.result = res
  const gained = applyJudge(res)
  if (best.isHold) {
    best.holding = true
    best.lastTick = now
    best.pointerId = pointerId == null ? -1 : pointerId
  } else {
    best.judged = true
  }
  pushFloat(lane, gained)
}
function pushFloat(lane, val) {
  const id = ++floatId
  floats.value.push({ id, lane, val })
  setTimeout(() => {
    floats.value = floats.value.filter(f => f.id !== id)
  }, 750)
}
// 松开手指：结束该轨正在按的长音（提前松开不扣分，只是不再加按住的分）
function endHold(lane, pointerId) {
  for (const n of chart.value) {
    if (n.lane === lane && n.holding && (pointerId == null || n.pointerId === pointerId || n.pointerId === -1)) {
      n.holding = false
      n.judged = true
    }
  }
}
function onStagePointerUp(e) {
  if (screen.value !== 'play') return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const lane = Math.max(0, Math.min(3, Math.floor((x / rect.width) * 4)))
  endHold(lane, e.pointerId)
}
function onAnyPointerUp(e) {
  if (screen.value !== 'play') return
  for (const n of chart.value) {
    if (n.holding && n.pointerId === e.pointerId) {
      n.holding = false
      n.judged = true
    }
  }
}
// 点下落的黑块：按横坐标换算成对应的轨（多指同时点按各自触发）
function onStageTap(e) {
  if (screen.value !== 'play') return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const lane = Math.max(0, Math.min(3, Math.floor((x / rect.width) * 4)))
  hit(lane, e.pointerId)
}

// ---- 主循环 ----
let rafId = 0
let songStartPerf = 0
function loop() {
  if (screen.value !== 'play' || countdown.value > 0 || paused.value) return
  const now = (performance.now() - songStartPerf) / 1000
  nowSec.value = now
  for (const n of chart.value) {
    if (n.holding) {
      if (now >= n.end) {
        n.holding = false
        n.judged = true
      } else if (now - n.lastTick >= 0.1) {
        n.lastTick = now
        score.value += HOLD_TICK_SCORE
      }
      continue
    }
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
  floats.value = []
  flashKey.value = [0, 0, 0, 0]
  paused.value = false
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
  portraitHint.value = window.innerHeight > window.innerWidth
  ensureAudio()
  startBgLoop()
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

// ---- 暂停 / 继续 ----
let pausedAtPerf = 0
function togglePause() {
  if (screen.value !== 'play' || countdown.value > 0 || songOver.value) return
  if (!paused.value) {
    paused.value = true
    pausedAtPerf = performance.now()
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
  } else {
    paused.value = false
    songStartPerf += performance.now() - pausedAtPerf
    rafId = requestAnimationFrame(loop)
  }
}

// ---- 背景：深棕底 + 细白几何线 + 金色点缀，缓慢漂移 ----
let bgRaf = 0
let bgShapes = null
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function initBgShapes() {
  const rand = mulberry32(20261125)
  const kinds = ['line', 'rect', 'circle', 'arc', 'diag']
  bgShapes = []
  for (let i = 0; i < 26; i++) {
    bgShapes.push({
      kind: kinds[Math.floor(rand() * kinds.length)],
      x: rand(), y: rand(),
      s: 0.03 + rand() * 0.12,
      rot: rand() * Math.PI,
      gold: rand() < 0.25,
      a: 0.04 + rand() * 0.08,
      sp: 0.2 + rand() * 0.6,
      ph: rand() * Math.PI * 2
    })
  }
}
function drawBg(t) {
  const c = bgCanvasRef.value
  if (!c) return
  const w = c.clientWidth
  const h = c.clientHeight
  if (!w || !h) return
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
    c.width = Math.floor(w * dpr)
    c.height = Math.floor(h * dpr)
  }
  const ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#171210'
  ctx.fillRect(0, 0, w, h)
  const glow = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, Math.max(w, h) * 0.7)
  glow.addColorStop(0, 'rgba(120, 110, 200, 0.10)')
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  if (!bgShapes) initBgShapes()
  const base = Math.max(w, h)
  for (const s of bgShapes) {
    const dx = Math.sin(t * 0.001 * s.sp + s.ph) * 6
    const dy = Math.cos(t * 0.001 * s.sp * 0.7 + s.ph) * 4
    const x = s.x * w + dx
    const y = s.y * h + dy
    const size = s.s * base
    ctx.strokeStyle = s.gold ? 'rgba(212, 175, 55, ' + (s.a + 0.12) + ')' : 'rgba(255, 255, 255, ' + s.a + ')'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (s.kind === 'line' || s.kind === 'diag') {
      const len = size * 2
      const ang = s.kind === 'diag' ? Math.PI / 4 : s.rot
      ctx.moveTo(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2)
      ctx.lineTo(x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2)
    } else if (s.kind === 'rect') {
      ctx.rect(x - size / 2, y - size / 2, size, size * 0.7)
    } else if (s.kind === 'circle') {
      ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    } else {
      ctx.arc(x, y, size / 2, s.rot, s.rot + Math.PI * 1.2)
    }
    ctx.stroke()
  }
}
function bgLoop(t) {
  if (screen.value !== 'play') { bgRaf = 0; return }
  drawBg(t)
  bgRaf = requestAnimationFrame(bgLoop)
}
function startBgLoop() {
  if (bgRaf) return
  bgRaf = requestAnimationFrame(bgLoop)
}
function stopBgLoop() {
  if (bgRaf) { cancelAnimationFrame(bgRaf); bgRaf = 0 }
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
    if (paused.value) return
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
  stopBgLoop()
  paused.value = false
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
  window.addEventListener('pointerup', onAnyPointerUp)
  window.addEventListener('pointercancel', onAnyPointerUp)
  if (userStore.refreshUserInfo) userStore.refreshUserInfo()
  const code = (route.query.code || '').toString().trim().toUpperCase()
  if (code) doJoin(code)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerup', onAnyPointerUp)
  window.removeEventListener('pointercancel', onAnyPointerUp)
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
/* ---- 钢琴块 2 式：全屏横屏舞台 ---- */
.play {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: #171210;
}
.play-stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.bg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.hud-combo {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 46px;
  font-weight: 900;
  color: #ff3b30;
  line-height: 1;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
  z-index: 6;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.hud-score {
  position: absolute;
  top: 14px;
  right: 60px;
  font-size: 22px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 2px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
  z-index: 6;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.pause-btn {
  position: absolute;
  top: 56px;
  right: 12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  z-index: 6;
}
.rotate-hint {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  z-index: 7;
  cursor: pointer;
  white-space: nowrap;
}
.lanes-wrap {
  position: absolute;
  top: 72px;
  bottom: 46px;
  left: 50%;
  transform: translateX(-50%);
  width: min(430px, 92%);
  background: linear-gradient(180deg, rgba(139, 146, 255, 0.10), rgba(139, 146, 255, 0.18));
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.lanes {
  position: absolute;
  inset: 0;
  display: flex;
}
.lane {
  flex: 1;
  position: relative;
  border-left: 1px solid rgba(255, 255, 255, 0.09);
}
.lane:first-child {
  border-left: none;
}
.tile {
  position: absolute;
  left: 0;
  width: 100%;
  transform: translateY(-50%);
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-top: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 3px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.tile.hold {
  background: linear-gradient(180deg, #1e3a8a, #172554);
  border: 2px solid #d4af37;
}
.tile.holding {
  box-shadow: 0 0 14px rgba(77, 171, 247, 0.85);
}
.lane-flash {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 16%;
  background: radial-gradient(ellipse at center, rgba(77, 171, 247, 0.55), rgba(77, 171, 247, 0));
  animation: flashfade 0.18s ease-out forwards;
  pointer-events: none;
}
@keyframes flashfade {
  from { opacity: 1; }
  to { opacity: 0; }
}
.hit-zone {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 12%;
  background: rgba(255, 255, 255, 0.04);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  pointer-events: none;
}
.float-num {
  position: absolute;
  bottom: 20%;
  transform: translateX(-50%);
  color: #4dabf7;
  font-size: 22px;
  font-weight: bold;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
  pointer-events: none;
  animation: floatup 0.7s ease-out forwards;
  z-index: 5;
}
@keyframes floatup {
  0% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, -46px); }
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
.pause-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  z-index: 8;
}
.pause-title {
  color: #fff;
  font-size: 26px;
  font-weight: bold;
}
.bottom-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 14px;
  color: #fff;
  font-size: 14px;
  z-index: 6;
  pointer-events: none;
}
.song-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
}
.diff-label {
  font-weight: bold;
  color: #ffd43b;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
  flex-shrink: 0;
}
.free-lanes {
  display: flex;
  gap: 6px;
  height: 320px;
  margin-bottom: 18px;
}
.free-lane {
  flex: 1;
  min-width: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, #1c1a26, #0d0d12);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.free-lane.active {
  background: #4dabf7;
}
.free-hint {
  text-align: center;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
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
