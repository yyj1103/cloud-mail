import BizError from '../error/biz-error';
import orm from '../entity/orm';
import user from '../entity/user';
import account from '../entity/account';
import { inArray } from 'drizzle-orm';
import dayjs from 'dayjs';
import { t } from '../i18n/i18n'
import emailUtils from '../utils/email-utils';

// 节奏对战房间（冰面炫舞 → 钢琴对战）：房主建房间拿 6 位邀请码，好友凭邀请码进房，
// 同一首曲子同时弹/跳，按分数排名。房间和选手存在 dance_room / dance_player 两张表里
// （见 init v3_13DB）。房间记一首曲子 song（twinkle/ode/tiger/jingle），进房的人从房间读
// 曲子，服务端只同步分数。
// 没跑过 init 也能用：每次用到之前先建表（已存在时什么都不做）。
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const danceService = {

	async ensureTables(c) {
		await c.env.db.batch([
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS dance_room (
				code TEXT PRIMARY KEY,
				host_user_id INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'waiting',
				song TEXT NOT NULL DEFAULT 'twinkle',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				started_at INTEGER
			)`),
			c.env.db.prepare(`CREATE TABLE IF NOT EXISTS dance_player (
				code TEXT NOT NULL,
				user_id INTEGER NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				score INTEGER NOT NULL DEFAULT 0,
				max_combo INTEGER NOT NULL DEFAULT 0,
				perfect INTEGER NOT NULL DEFAULT 0,
				great INTEGER NOT NULL DEFAULT 0,
				good INTEGER NOT NULL DEFAULT 0,
				miss INTEGER NOT NULL DEFAULT 0,
				finished INTEGER NOT NULL DEFAULT 0,
				updated_at INTEGER,
				PRIMARY KEY (code, user_id)
			)`)
		]);
		// 老房间表没有 song 列时补一列（列已存在会报错，直接忽略）
		try {
			await c.env.db.prepare(`ALTER TABLE dance_room ADD COLUMN song TEXT DEFAULT 'twinkle'`).run();
		} catch (e) { /* 列已存在 */ }
	},

	newCode() {
		let code = '';
		for (let i = 0; i < 6; i++) {
			code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
		}
		return code;
	},

	async getRoomRow(c, code) {
		const row = await c.env.db.prepare(
			`SELECT code, host_user_id, status, song, created_at, started_at FROM dance_room WHERE code = ?`
		).bind(code).first();
		return row || null;
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

	async getDance(c, code, userId) {
		await this.ensureTables(c);
		code = (code || '').trim().toUpperCase();
		const room = await this.getRoomRow(c, code);
		if (!room) {
			throw new BizError(t('roomNotFound'));
		}
		const rows = await c.env.db.prepare(
			`SELECT user_id, name, score, max_combo, perfect, great, good, miss, finished, updated_at FROM dance_player WHERE code = ? ORDER BY score DESC`
		).bind(code).all();
		const players = rows.results || [];
		const infoMap = await this.playerInfoMap(c, players.map(p => p.user_id));
		return {
			code: room.code,
			hostUserId: room.host_user_id,
			status: room.status,
			song: room.song || 'twinkle',
			startedAt: room.started_at || null,
			isHost: room.host_user_id === userId,
			players: players.map(p => ({
				userId: p.user_id,
				name: infoMap[p.user_id]?.name || p.name || '',
				email: infoMap[p.user_id]?.email || '',
				avatar: infoMap[p.user_id]?.avatar || '',
				score: p.score || 0,
				maxCombo: p.max_combo || 0,
				perfect: p.perfect || 0,
				great: p.great || 0,
				good: p.good || 0,
				miss: p.miss || 0,
				finished: !!p.finished,
				updatedAt: p.updated_at || null
			}))
		};
	},

	async createDance(c, params, userId) {
		await this.ensureTables(c);
		// 顺手清掉一天前的旧房间（不管开没开跳）和没房间的孤儿选手，免得邀请码被占着
		await c.env.db.prepare(
			`DELETE FROM dance_room WHERE created_at < datetime('now', '-1 day')`
		).run();
		await c.env.db.prepare(
			`DELETE FROM dance_player WHERE code NOT IN (SELECT code FROM dance_room)`
		).run();
		const name = (params.name || '').trim();
		const songs = ['twinkle', 'ode', 'tiger', 'jingle'];
		const song = songs.includes(params.song) ? params.song : 'twinkle';
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
			`INSERT INTO dance_room (code, host_user_id, status, song, created_at) VALUES (?, ?, 'waiting', ?, ?)`
		).bind(code, userId, song, dayjs().format('YYYY-MM-DD HH:mm:ss')).run();
		await c.env.db.prepare(
			`INSERT INTO dance_player (code, user_id, name, score, max_combo, perfect, great, good, miss, finished, updated_at) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?)`
		).bind(code, userId, name, Date.now()).run();
		return { code };
	},

	async joinDance(c, params, userId) {
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
			`INSERT OR IGNORE INTO dance_player (code, user_id, name, score, max_combo, perfect, great, good, miss, finished, updated_at) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?)`
		).bind(code, userId, name, Date.now()).run();
		return { code };
	},

	async startDance(c, params, userId) {
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
			`UPDATE dance_room SET status = 'racing', started_at = ? WHERE code = ?`
		).bind(Date.now(), code).run();
		return { code };
	},

	async updateScore(c, params, userId) {
		await this.ensureTables(c);
		const code = (params.code || '').trim().toUpperCase();
		const room = await this.getRoomRow(c, code);
		if (!room) {
			throw new BizError(t('roomNotFound'));
		}
		if (room.status !== 'racing') {
			return { ok: false };
		}
		const row = await c.env.db.prepare(
			`SELECT finished FROM dance_player WHERE code = ? AND user_id = ?`
		).bind(code, userId).first();
		if (!row) {
			throw new BizError(t('roomNotFound'));
		}
		const clampInt = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
		const score = clampInt(params.score, 999999);
		const maxCombo = clampInt(params.maxCombo, 10000);
		const perfect = clampInt(params.perfect, 10000);
		const great = clampInt(params.great, 10000);
		const good = clampInt(params.good, 10000);
		const miss = clampInt(params.miss, 10000);
		const finished = params.finished ? 1 : (row.finished ? 1 : 0);
		await c.env.db.prepare(
			`UPDATE dance_player SET score = ?, max_combo = ?, perfect = ?, great = ?, good = ?, miss = ?, finished = ?, updated_at = ? WHERE code = ? AND user_id = ?`
		).bind(score, maxCombo, perfect, great, good, miss, finished, Date.now(), code, userId).run();
		return { ok: true, finished: !!finished };
	},

	async leaveDance(c, params, userId) {
		await this.ensureTables(c);
		const code = (params.code || '').trim().toUpperCase();
		if (!code) {
			return;
		}
		const room = await this.getRoomRow(c, code);
		await c.env.db.prepare(
			`DELETE FROM dance_player WHERE code = ? AND user_id = ?`
		).bind(code, userId).run();
		if (room && room.host_user_id === userId && room.status === 'waiting') {
			// 房主在开跳前离开，房间直接解散
			await c.env.db.prepare(`DELETE FROM dance_player WHERE code = ?`).bind(code).run();
			await c.env.db.prepare(`DELETE FROM dance_room WHERE code = ?`).bind(code).run();
			return;
		}
		// 房间没人了就清掉
		const left = await c.env.db.prepare(
			`SELECT COUNT(*) AS n FROM dance_player WHERE code = ?`
		).bind(code).first();
		if (left && !left.n) {
			await c.env.db.prepare(`DELETE FROM dance_room WHERE code = ?`).bind(code).run();
		}
	}
};

export default danceService;
