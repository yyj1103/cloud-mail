import BizError from '../error/biz-error';
import orm from '../entity/orm';
import user from '../entity/user';
import account from '../entity/account';
import { inArray } from 'drizzle-orm';
import dayjs from 'dayjs';
import { t } from '../i18n/i18n'
import emailUtils from '../utils/email-utils';

// 厘米FLY 赛跑：房主建房间拿 6 位邀请码，好友凭邀请码进房一起滑坡比拼。
// 房间和选手存在 race_room / race_player 两张表里（见 init v3_12DB）。
// 没跑过 init 也能用：每次用到之前先建表（已存在时什么都不做）。
const TRACK_LENGTH = 1000;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const raceService = {

	async ensureTables(c) {
		await c.env.db.batch([
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS race_room (
				code TEXT PRIMARY KEY,
				host_user_id INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'waiting',
				track_length INTEGER NOT NULL DEFAULT 1000,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				started_at INTEGER
			)`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS race_player (
				code TEXT NOT NULL,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				distance REAL NOT NULL DEFAULT 0,
				score INTEGER NOT NULL DEFAULT 0,
				finished INTEGER NOT NULL DEFAULT 0,
				finish_ms INTEGER,
				updated_at INTEGER,
				PRIMARY KEY (code, user_id)
			)`)
		]);
	},

	newCode() {
		let code = '';
		for (let i = 0; i < 6; i++) {
			code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
		}
		return code;
	},

	async getRoomRow(c, code) {
		const res = await c.env.db.prepare(
			`SELECT code, host_user_id, status, track_length, created_at, started_at FROM race_room WHERE code = ?`
		).bind(code).all();
		return (res.results && res.results[0]) || null;
	},

	// 选手名字和头像：跟私信里一样，优先用账号名字，没有就用邮箱 @ 前面那段
	async playerInfoMap(c, userIds) {
		if (!userIds.length) {
			return {};
		}
		const [users, accounts] = await Promise.all([
			orm(c).select().from(user).where(inArray(user.userId, userIds)).all(),
			orm(c).select().from(account).where(inArray(account.userId, userIds)).all()
		]);
		const accountMap = Object.fromEntries(accounts.map(a => [a.userId, a]));
		const map = {};
		for (const u of users) {
			map[u.userId] = {
				email: u.email,
				avatar: u.avatar || '',
				name: accountMap[u.userId]?.name || emailUtils.getName(u.email)
			};
		}
		return map;
	},

	async getRoom(c, code, userId) {
		await this.ensureTables(c);
		code = (code || '').trim().toUpperCase();
		const room = await this.getRoomRow(c, code);
		if (!room) {
			throw new BizError(t('roomNotFound'));
		}
		const rows = await c.env.db.prepare(
			`SELECT user_id, name, distance, score, finished, finish_ms, updated_at FROM race_player WHERE code = ? ORDER BY distance DESC`
		).bind(code).all();
		const players = rows.results || [];
		const infoMap = await this.playerInfoMap(c, players.map(p => p.user_id));
		return {
			code: room.code,
			hostUserId: room.host_user_id,
			status: room.status,
			trackLength: room.track_length,
			startedAt: room.started_at || null,
			isHost: room.host_user_id === userId,
			players: players.map(p => ({
				userId: p.user_id,
				name: infoMap[p.user_id]?.name || p.name || '',
				email: infoMap[p.user_id]?.email || '',
				avatar: infoMap[p.user_id]?.avatar || '',
				distance: p.distance || 0,
				score: p.score || 0,
				finished: !!p.finished,
				finishMs: p.finish_ms == null ? null : p.finish_ms,
				updatedAt: p.updated_at || null
			}))
		};
	},

	async createRace(c, params, userId) {
		await this.ensureTables(c);
		// 顺手清掉一天前还没开跑的旧房间，免得邀请码被占着
		await c.env.db.prepare(
			`DELETE FROM race_room WHERE status = 'waiting' AND created_at < datetime('now', '-1 day')`
		).run();
		const name = (params.name || '').trim();
		let code = '';
		for (let i = 0; i < 5; i++) {
			code = this.newCode();
			const exists = await this.getRoomRow(c, code);
			if (!exists) break;
			code = '';
		}
		if (!code) {
			throw new BizError(t('roomCreateFailed'));
		}
		await c.env.db.prepare(
			`INSERT INTO race_room (code, host_user_id, status, track_length, created_at) VALUES (?, ?, 'waiting', ?, ?)`
		).bind(code, userId, TRACK_LENGTH, dayjs().format('YYYY-MM-DD HH:mm:ss')).run();
		await c.env.db.prepare(
			`INSERT INTO race_player (code, user_id, name, distance, score, finished, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?)`
		).bind(code, userId, name, Date.now()).run();
		return { code, trackLength: TRACK_LENGTH };
	},

	async joinRace(c, params, userId) {
		await this.ensureTables(c);
		const code = (params.code || '').trim().toUpperCase();
		const room = await this.getRoomRow(c, code);
		if (!room) {
			throw new BizError(t('roomNotFound'));
		}
		if (room.status !== 'waiting') {
			throw new BizError(t('raceAlreadyStarted'));
		}
		const name = (params.name || '').trim();
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO race_player (code, user_id, name, distance, score, finished, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?)`
		).bind(code, userId, name, Date.now()).run();
		return { code };
	},

	async startRace(c, params, userId) {
		await this.ensureTables(c);
		const code = (params.code || '').trim().toUpperCase();
		const room = await this.getRoomRow(c, code);
		if (!room) {
			throw new BizError(t('roomNotFound'));
		}
		if (room.host_user_id !== userId) {
			throw new BizError(t('notRaceHost'));
		}
		if (room.status !== 'waiting') {
			throw new BizError(t('raceAlreadyStarted'));
		}
		await c.env.db.prepare(
			`UPDATE race_room SET status = 'racing', started_at = ? WHERE code = ?`
		).bind(Date.now(), code).run();
		return { code };
	},

	async updateProgress(c, params, userId) {
		await this.ensureTables(c);
		const code = (params.code || '').trim().toUpperCase();
		const room = await this.getRoomRow(c, code);
		if (!room) {
			throw new BizError(t('roomNotFound'));
		}
		if (room.status !== 'racing') {
			return { ok: false };
		}
		const rowRes = await c.env.db.prepare(
			`SELECT distance, finished, finish_ms FROM race_player WHERE code = ? AND user_id = ?`
		).bind(code, userId).all();
		const row = (rowRes.results && rowRes.results[0]) || null;
		if (!row) {
			throw new BizError(t('roomNotFound'));
		}
		let distance = Math.max(0, Math.min(room.track_length, Number(params.distance) || 0));
		let score = Math.max(-9999, Math.min(99999, Math.floor(Number(params.score) || 0)));
		let finished = row.finished ? 1 : 0;
		let finishMs = row.finish_ms;
		// 第一次冲线：记下用时，之后就算退回也不改
		if (!finished && distance >= room.track_length) {
			finished = 1;
			finishMs = room.started_at ? Date.now() - room.started_at : 0;
		}
		await c.env.db.prepare(
			`UPDATE race_player SET distance = ?, score = ?, finished = ?, finish_ms = ?, updated_at = ? WHERE code = ? AND user_id = ?`
		).bind(distance, score, finished, finishMs, Date.now(), code, userId).run();
		return { ok: true, finished: !!finished, finishMs: finishMs == null ? null : finishMs };
	},

	async leaveRace(c, params, userId) {
		await this.ensureTables(c);
		const code = (params.code || '').trim().toUpperCase();
		if (!code) {
			return;
		}
		const room = await this.getRoomRow(c, code);
		await c.env.db.prepare(
			`DELETE FROM race_player WHERE code = ? AND user_id = ?`
		).bind(code, userId).run();
		if (room && room.host_user_id === userId && room.status === 'waiting') {
			// 房主在开跑前离开，房间直接解散
			await c.env.db.prepare(`DELETE FROM race_player WHERE code = ?`).bind(code).run();
			await c.env.db.prepare(`DELETE FROM race_room WHERE code = ?`).bind(code).run();
			return;
		}
		// 房间没人了就清掉
		const leftRes = await c.env.db.prepare(
			`SELECT COUNT(*) AS n FROM race_player WHERE code = ?`
		).bind(code).all();
		const left = (leftRes.results && leftRes.results[0]) || null;
		if (left && !left.n) {
			await c.env.db.prepare(`DELETE FROM race_room WHERE code = ?`).bind(code).run();
		}
	}
};

export default raceService;
