import http from '@/axios/index.js'

// 节奏对战（钢琴对战）：建房、进房、查房、开局、上报分数、离房
// 建房时带上选的曲子 song（twinkle/ode/tiger/jingle），房间里的人都弹同一首
export function createDance(name, song) {
    return http.post('/dance/create', {name, song})
}

export function joinDance(code, name) {
    return http.post('/dance/join', {code, name})
}

export function getDanceRoom(code) {
    // 轮询用：房间没了也不弹报错，由调用方自己处理
    return http.get('/dance/room', {params: {code}, noMsg: true})
}

export function startDance(code) {
    return http.post('/dance/start', {code})
}

export function updateDanceScore(code, score, maxCombo, perfect, great, good, miss, finished) {
    // 轮询上报：不弹报错，由调用方自己处理
    return http.post('/dance/score', {code, score, maxCombo, perfect, great, good, miss, finished}, {noMsg: true})
}

export function leaveDance(code) {
    return http.post('/dance/leave', {code})
}
