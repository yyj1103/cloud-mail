import app from '../hono/hono';
import raceService from '../service/race-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.post('/race/create', async (c) => {
	const data = await raceService.createRace(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/race/join', async (c) => {
	const data = await raceService.joinRace(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/race/room', async (c) => {
	const data = await raceService.getRoom(c, c.req.query().code, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/race/start', async (c) => {
	const data = await raceService.startRace(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/race/progress', async (c) => {
	const data = await raceService.updateProgress(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/race/leave', async (c) => {
	await raceService.leaveRace(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});
