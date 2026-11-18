import BizError from '../error/biz-error';
import orm from '../entity/orm';
import user from '../entity/user';
import account from '../entity/account';
import { friend } from '../entity/friend';
import { privateMessage } from '../entity/private-message';
import { and, or, asc, desc, count, eq, gt, inArray } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import kvConst from '../const/kv-const';
import dayjs from 'dayjs';
import { t } from '../i18n/i18n'
import userService from './user-service';
import accountService from './account-service';
import emailUtils from '../utils/email-utils';

const friendStatus = {
	PENDING: 0,
	ACCEPTED: 1,
	REJECTED: 2
};

const dmService = {

	async searchUser(c, params, userId) {
		const { email } = params;

		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		const target = await userService.selectByEmail(c, email);

		if (!target) {
			throw new BizError(t('notExistUser'));
		}

		if (target.userId === userId) {
			throw new BizError(t('cannotAddSelf'));
		}

		const rel = await this.selectRelation(c, userId, target.userId);
		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		return {
			userId: target.userId,
			email: target.email,
			avatar: target.avatar || '',
			name: accountRow?.name || emailUtils.getName(email),
			relation: rel ? rel.status : -1,
			isRequester: rel ? rel.userId === userId : false,
			friendId: rel ? rel.friendId : null
		};
	},

	selectRelation(c, userId, friendUserId) {
		return orm(c).select().from(friend).where(
			or(
				and(eq(friend.userId, userId), eq(friend.friendUserId, friendUserId)),
				and(eq(friend.userId, friendUserId), eq(friend.friendUserId, userId))
			)).get();
	},

	async isFriend(c, userId, friendUserId) {
		const rel = await this.selectRelation(c, userId, friendUserId);
		return !!rel && rel.status === friendStatus.ACCEPTED;
	},

	async sendRequest(c, params, userId) {
		const { email } = params;

		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		const target = await userService.selectByEmail(c, email);

		if (!target) {
			throw new BizError(t('notExistUser'));
		}

		if (target.userId === userId) {
			throw new BizError(t('cannotAddSelf'));
		}

		const existing = await this.selectRelation(c, userId, target.userId);

		if (existing) {
			if (existing.status === friendStatus.ACCEPTED) {
				throw new BizError(t('alreadyFriend'));
			}
			if (existing.status === friendStatus.PENDING) {
				throw new BizError(t('friendRequestPending'));
			}
			await orm(c).update(friend).set({
				status: friendStatus.PENDING,
				userId,
				friendUserId: target.userId,
				updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
			}).where(eq(friend.friendId, existing.friendId)).run();
			return;
		}

		await orm(c).insert(friend).values({ userId, friendUserId: target.userId, status: friendStatus.PENDING }).run();
	},

	async listRequests(c, params, userId) {
		const incoming = await orm(c).select().from(friend).where(
			and(eq(friend.friendUserId, userId), eq(friend.status, friendStatus.PENDING)))
			.orderBy(desc(friend.friendId)).all();
		const outgoing = await orm(c).select().from(friend).where(
			and(eq(friend.userId, userId), eq(friend.status, friendStatus.PENDING)))
			.orderBy(desc(friend.friendId)).all();

		const ids = [...new Set([...incoming.map(r => r.userId), ...outgoing.map(r => r.friendUserId)])];
		const infoMap = await this.userInfoMap(c, ids, this.parseAvatarVers(params));

		return {
			incoming: incoming.map(r => ({ ...r, ...infoMap[r.userId] })),
			outgoing: outgoing.map(r => ({ ...r, ...infoMap[r.friendUserId] }))
		};
	},

	async respondRequest(c, params, userId) {
		const { friendId, accept } = params;

		const row = await orm(c).select().from(friend).where(eq(friend.friendId, friendId)).get();

		if (!row || row.friendUserId !== userId || row.status !== friendStatus.PENDING) {
			throw new BizError(t('friendRequestNotExist'));
		}

		await orm(c).update(friend).set({
			status: accept ? friendStatus.ACCEPTED : friendStatus.REJECTED,
			updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(friend.friendId, friendId)).run();
	},

	async listFriends(c, userId, knownVers = {}) {
		const rows = await orm(c).select().from(friend).where(
			and(eq(friend.status, friendStatus.ACCEPTED),
				or(eq(friend.userId, userId), eq(friend.friendUserId, userId))))
			.orderBy(desc(friend.updateTime)).all();

		const friendIds = rows.map(r => r.userId === userId ? r.friendUserId : r.userId);

		if (!friendIds.length) {
			return [];
		}

		const infoMap = await this.userInfoMap(c, friendIds, knownVers);

		return friendIds.map(id => ({ userId: id, ...infoMap[id] }));
	},

	async avatarVer(avatar) {
		if (!avatar) {
			return '';
		}
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(avatar));
		return [...new Uint8Array(digest)].slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
	},

	parseAvatarVers(params) {
		try {
			const vers = params && params.avatarVers ? JSON.parse(params.avatarVers) : {};
			return vers && typeof vers === 'object' ? vers : {};
		} catch (e) {
			return {};
		}
	},

	async userInfoMap(c, userIds, knownVers = {}) {
		if (!userIds.length) {
			return {};
		}

		const [users, accounts] = await Promise.all([
			orm(c).select().from(user).where(inArray(user.userId, userIds)).all(),
			orm(c).select().from(account).where(inArray(account.userId, userIds)).all()
		]);

		const accountMap = Object.fromEntries(accounts.map(a => [a.userId, a]));

		const entries = await Promise.all(users.map(async u => {
			const avatar = u.avatar || '';
			const ver = await this.avatarVer(avatar);
			return [u.userId, {
				email: u.email,
				// 前端已缓存同一版本头像时不再重复下发整张图
				avatar: knownVers[u.userId] && knownVers[u.userId] === ver ? '' : avatar,
				avatarVer: ver,
				name: accountMap[u.userId]?.name || emailUtils.getName(u.email)
			}];
		}));

		return Object.fromEntries(entries);
	},

	async removeFriend(c, params, userId) {
		const friendUserId = Number(params.friendUserId);

		await orm(c).delete(friend).where(
			or(
				and(eq(friend.userId, userId), eq(friend.friendUserId, friendUserId)),
				and(eq(friend.userId, friendUserId), eq(friend.friendUserId, userId))
			)).run();
	},

	async sendMessage(c, params, userId) {
		let { receiverUserId, content, type, replyToMessageId } = params;

		receiverUserId = Number(receiverUserId);
		type = Number(type) === 1 ? 1 : 0;

		if (type === 1) {
			content = (content || '').trim();

			const match = content.match(/^data:image\/(jpeg|png|gif|webp);base64,([A-Za-z0-9+/=]+)$/);

			if (!match) {
				throw new BizError(t('invalidImage'));
			}

			if (Math.floor(match[2].length * 3 / 4) > 1024 * 1024) {
				throw new BizError(t('imageTooLarge'));
			}
		} else {
			content = (content || '').trim();

			if (!content) {
				throw new BizError(t('emptyMessage'));
			}

			if (content.length > 2000) {
				throw new BizError(t('messageTooLong'));
			}
		}

		if (!await this.isFriend(c, userId, receiverUserId)) {
			throw new BizError(t('notFriend'));
		}

		// 引用回复：被引用的消息必须是同一对话里还没被撤回的消息，否则忽略引用
		let replyTo = 0;
		const replyId = Number(replyToMessageId);
		if (!isNaN(replyId) && replyId > 0) {
			const target = await orm(c).select().from(privateMessage).where(
				and(eq(privateMessage.messageId, replyId), eq(privateMessage.isDel, isDel.NORMAL),
					or(
						and(eq(privateMessage.senderUserId, userId), eq(privateMessage.receiverUserId, receiverUserId)),
						and(eq(privateMessage.senderUserId, receiverUserId), eq(privateMessage.receiverUserId, userId))
					))).get();
			if (target) {
				replyTo = replyId;
			}
		}

		const key = kvConst.DM_SEND + userId + ':' + dayjs().format('YYYYMMDDHHmm');
		const n = Number(await c.env.kv.get(key) || 0);

		if (n >= 30) {
			throw new BizError(t('sendTooFast'));
		}

		await c.env.kv.put(key, String(n + 1), { expirationTtl: 120 });

		const { messageId } = await orm(c).insert(privateMessage).values({
			senderUserId: userId,
			receiverUserId,
			content,
			type,
			replyToMessageId: replyTo
		}).returning().get();

		return messageId;
	},

	async listConversations(c, params, userId) {
		const friends = await this.listFriends(c, userId, this.parseAvatarVers(params));

		if (!friends.length) {
			return [];
		}

		const friendIds = friends.map(f => f.userId);
		const placeholders = friendIds.map(() => '?').join(',');

		// 每位好友的最后一条消息一次查出：只带 100 字以内的文字预览，图片不带原内容
		const lastRows = await c.env.db.prepare(
			`SELECT message_id, sender_user_id, receiver_user_id, type, create_time,
				CASE WHEN type = 1 THEN NULL ELSE substr(content, 1, 100) END AS content
			FROM private_message
			WHERE is_del = 0 AND message_id IN (
				SELECT MAX(message_id) FROM private_message
				WHERE is_del = 0
					AND ((sender_user_id = ? AND receiver_user_id IN (${placeholders}))
						OR (receiver_user_id = ? AND sender_user_id IN (${placeholders})))
				GROUP BY CASE WHEN sender_user_id = ? THEN receiver_user_id ELSE sender_user_id END
			)`
		).bind(userId, ...friendIds, userId, ...friendIds, userId).all();

		const lastMap = {};
		for (const row of lastRows.results || []) {
			const peer = row.sender_user_id === userId ? row.receiver_user_id : row.sender_user_id;
			lastMap[peer] = {
				messageId: row.message_id,
				senderUserId: row.sender_user_id,
				receiverUserId: row.receiver_user_id,
				type: row.type,
				createTime: row.create_time,
				content: row.content
			};
		}

		// 未读数一次聚合查出，不再每人查一次
		const unreadRows = await c.env.db.prepare(
			`SELECT sender_user_id, COUNT(*) AS total FROM private_message
			WHERE receiver_user_id = ? AND is_read = 0 AND is_del = 0
				AND sender_user_id IN (${placeholders})
			GROUP BY sender_user_id`
		).bind(userId, ...friendIds).all();

		const unreadMap = {};
		for (const row of unreadRows.results || []) {
			unreadMap[row.sender_user_id] = row.total || 0;
		}

		const result = friends.map(f => ({ ...f, lastMessage: lastMap[f.userId] || null, unread: unreadMap[f.userId] || 0 }));

		result.sort((a, b) => {
			const ta = a.lastMessage?.createTime || '';
			const tb = b.lastMessage?.createTime || '';
			return tb.localeCompare(ta);
		});

		return result;
	},


	// 给消息列表挂上引用原文：一次查出所有被引用的消息；图片只留类型不带原内容；
	// 被引用的消息已被撤回时不返回，前端就不显示引用块（撤回的消息双方都看不见）
	async attachReplyInfo(c, list, userId, friendUserId) {
		if (!list || !list.length) {
			return list;
		}

		const replyIds = [...new Set(list.map(m => m.replyToMessageId).filter(id => id))];

		if (!replyIds.length) {
			return list;
		}

		const rows = await orm(c).select().from(privateMessage).where(
			and(
				inArray(privateMessage.messageId, replyIds),
				eq(privateMessage.isDel, isDel.NORMAL),
				or(
					and(eq(privateMessage.senderUserId, userId), eq(privateMessage.receiverUserId, friendUserId)),
					and(eq(privateMessage.senderUserId, friendUserId), eq(privateMessage.receiverUserId, userId))
				)
			)).all();

		const map = {};
		for (const r of rows) {
			map[r.messageId] = {
				messageId: r.messageId,
				senderUserId: r.senderUserId,
				type: r.type,
				content: r.type === 1 ? null : (r.content || '').slice(0, 100)
			};
		}

		for (const m of list) {
			m.replyTo = (m.replyToMessageId && map[m.replyToMessageId]) || null;
		}

		return list;
	},

	async listMessages(c, params, userId) {
		let { friendUserId, num, size, after } = params;

		friendUserId = Number(friendUserId);
		size = Number(size);
		num = Number(num);
		after = Number(after);

		if (isNaN(size) || size <= 0) {
			size = 30;
		}

		if (size > 50) {
			size = 50;
		}

		if (isNaN(num) || num <= 0) {
			num = 1;
		}

		if (!await this.isFriend(c, userId, friendUserId)) {
			throw new BizError(t('notFriend'));
		}

		const pairFilter = or(
			and(eq(privateMessage.senderUserId, userId), eq(privateMessage.receiverUserId, friendUserId)),
			and(eq(privateMessage.senderUserId, friendUserId), eq(privateMessage.receiverUserId, userId))
		);

		const markRead = () => orm(c).update(privateMessage).set({ isRead: 1 }).where(
			and(
				eq(privateMessage.receiverUserId, userId),
				eq(privateMessage.senderUserId, friendUserId),
				eq(privateMessage.isRead, 0)
			)).run();

		// 增量拉取：轮询时只取比 after 新的消息，不再整页重下（图片 base64 不再每 10 秒重传一次）
		// 顺带返回当前可见的消息 id 列表，前端用它发现对方撤回的消息并本地去掉
		if (!isNaN(after) && after > 0) {
			const list = await orm(c).select().from(privateMessage).where(
				and(eq(privateMessage.isDel, isDel.NORMAL), gt(privateMessage.messageId, after), pairFilter)
			).orderBy(asc(privateMessage.messageId)).limit(size).all();

			const idRows = await orm(c).select({ messageId: privateMessage.messageId }).from(privateMessage).where(
				and(eq(privateMessage.isDel, isDel.NORMAL), pairFilter)
			).orderBy(desc(privateMessage.messageId)).limit(500).all();

			await markRead();

			return { list: await this.attachReplyInfo(c, list, userId, friendUserId), ids: idRows.map(r => r.messageId) };
		}

		const list = await orm(c).select().from(privateMessage).where(
			and(eq(privateMessage.isDel, isDel.NORMAL), pairFilter)
		).orderBy(desc(privateMessage.messageId)).limit(size).offset((num - 1) * size).all();

		await markRead();

		return (await this.attachReplyInfo(c, list, userId, friendUserId)).reverse();
	},


	async unreadCount(c, userId) {
		const { total } = await orm(c).select({ total: count() }).from(privateMessage).where(
			and(
				eq(privateMessage.receiverUserId, userId),
				eq(privateMessage.isRead, 0),
				eq(privateMessage.isDel, isDel.NORMAL)
			)).get();

		return total || 0;
	},

	async editMessage(c, params, userId) {
		const messageId = Number(params.messageId);
		const content = (params.content || '').trim();

		if (!content) {
			throw new BizError(t('emptyMessage'));
		}

		if (content.length > 2000) {
			throw new BizError(t('messageTooLong'));
		}

		const row = await orm(c).select().from(privateMessage).where(eq(privateMessage.messageId, messageId)).get();

		// 只能编辑自己发的、没被撤回的文字消息
		if (!row || row.senderUserId !== userId || row.isDel === isDel.DELETE || row.type === 1) {
			throw new BizError(t('dmCannotEdit'));
		}

		await orm(c).update(privateMessage).set({ content, isEdited: 1 }).where(eq(privateMessage.messageId, messageId)).run();
	},

	async deleteMessage(c, params, userId) {
		const messageId = Number(params.messageId);

		await orm(c).update(privateMessage).set({ isDel: isDel.DELETE }).where(
			and(
				eq(privateMessage.messageId, messageId),
				eq(privateMessage.senderUserId, userId)
			)).run();
	}
};

export default dmService;
