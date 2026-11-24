import http from '@/axios/index.js'

// 冰面炫舞：建房、进房、查房、开跳、上报分数、离房
export function createDance(name) {
    return http.post('/dance/create', {name})
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
