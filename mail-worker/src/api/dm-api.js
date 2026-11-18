import app from '../hono/hono';
import dmService from '../service/dm-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/dm/search', async (c) => {
	const data = await dmService.searchUser(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/dm/friend/request', async (c) => {
	await dmService.sendRequest(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/dm/friend/requests', async (c) => {
	const data = await dmService.listRequests(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.put('/dm/friend/respond', async (c) => {
	await dmService.respondRequest(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/dm/friends', async (c) => {
	const data = await dmService.listFriends(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/dm/friend', async (c) => {
	await dmService.removeFriend(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/dm/message', async (c) => {
	const messageId = await dmService.sendMessage(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(messageId));
});

app.get('/dm/conversations', async (c) => {
	const data = await dmService.listConversations(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/dm/messages', async (c) => {
	const data = await dmService.listMessages(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/dm/unreadCount', async (c) => {
	const data = await dmService.unreadCount(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/dm/message', async (c) => {
	await dmService.deleteMessage(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});
