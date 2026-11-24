import app from '../hono/hono';
import danceService from '../service/dance-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.post('/dance/create', async (c) => {
	const data = await danceService.createDance(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/dance/join', async (c) => {
	const data = await danceService.joinDance(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/dance/room', async (c) => {
	const data = await danceService.getDance(c, c.req.query().code, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/dance/start', async (c) => {
	const data = await danceService.startDance(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/dance/score', async (c) => {
	const data = await danceService.updateScore(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/dance/leave', async (c) => {
	await danceService.leaveDance(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});
