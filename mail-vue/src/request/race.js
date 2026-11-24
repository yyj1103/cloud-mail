import http from '@/axios/index.js'

// 厘米FLY 赛跑：建房、进房、查房、开跑、上报进度、离房
export function createRace(name) {
    return http.post('/race/create', {name})
}

export function joinRace(code, name) {
    return http.post('/race/join', {code, name})
}

export function getRoom(code) {
    // 轮询用：房间没了也不弹报错，由调用方自己处理
    return http.get('/race/room', {params: {code}, noMsg: true})
}

export function startRace(code) {
    return http.post('/race/start', {code})
}

export function updateProgress(code, distance, score, finished) {
    return http.post('/race/progress', {code, distance, score, finished})
}

export function leaveRace(code) {
    return http.post('/race/leave', {code})
}
