import http from '@/axios/index.js'

export function searchUser(email) {
    return http.get('/dm/search', {params: {email}})
}

export function sendFriendRequest(email) {
    return http.post('/dm/friend/request', {email})
}

export function listFriendRequests(avatarVers) {
    const params = {}
    if (avatarVers) params.avatarVers = JSON.stringify(avatarVers)
    return http.get('/dm/friend/requests', {params})
}

export function respondFriendRequest(friendId, accept) {
    return http.put('/dm/friend/respond', {friendId, accept})
}

export function listFriends() {
    return http.get('/dm/friends')
}

export function removeFriend(friendUserId) {
    return http.delete('/dm/friend', {params: {friendUserId}})
}

export function sendMessage(receiverUserId, content, type = 0) {
    return http.post('/dm/message', {receiverUserId, content, type})
}

export function listConversations(avatarVers) {
    const params = {}
    if (avatarVers) params.avatarVers = JSON.stringify(avatarVers)
    return http.get('/dm/conversations', {params})
}

export function listMessages(friendUserId, num, size, after) {
    const params = {friendUserId, num, size}
    if (after) params.after = after
    return http.get('/dm/messages', {params})
}

export function unreadCount() {
    return http.get('/dm/unreadCount')
}

export function deleteMessage(messageId) {
    return http.delete('/dm/message', {params: {messageId}})
}
