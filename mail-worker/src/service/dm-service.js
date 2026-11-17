import BizError from '../error/biz-error';
import orm from '../entity/orm';
import user from '../entity/user';
import account from '../entity/account';
import { friend } from '../entity/friend';
import { privateMessage } from '../entity/private-message';
import { and, or, asc, desc, count, eq, inArray } from 'drizzle-orm';
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

	async listRequests(c, userId) {
		const incoming = await orm(c).select().from(friend).where(
			and(eq(friend.friendUserId, userId), eq(friend.status, friendStatus.PENDING)))
			.orderBy(desc(friend.friendId)).all();
		const outgoing = await orm(c).select().from(friend).where(
			and(eq(friend.userId, userId), eq(friend.status, friendStatus.PENDING)))
			.orderBy(desc(friend.friendId)).all();

		const ids = [...new Set([...incoming.map(r => r.userId), ...outgoing.map(r => r.friendUserId)])];
		const infoMap = await this.userInfoMap(c, ids);

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

	async listFriends(c, userId) {
		const rows = await orm(c).select().from(friend).where(
			and(eq(friend.status, friendStatus.ACCEPTED),
				or(eq(friend.userId, userId), eq(friend.friendUserId, userId))))
			.orderBy(desc(friend.updateTime)).all();

		const friendIds = rows.map(r => r.userId === userId ? r.friendUserId : r.userId);

		if (!friendIds.length) {
			return [];
		}

		const infoMap = await this.userInfoMap(c, friendIds);

		return friendIds.map(id => ({ userId: id, ...infoMap[id] }));
	},

	async userInfoMap(c, userIds) {
		if (!userIds.length) {
			return {};
		}

		const [users, accounts] = await Promise.all([
			orm(c).select().from(user).where(inArray(user.userId, userIds)).all(),
			orm(c).select().from(account).where(inArray(account.userId, userIds)).all()
		]);

		const accountMap = Object.fromEntries(accounts.map(a => [a.userId, a]));

		return Object.fromEntries(users.map(u => [u.userId, {
			email: u.email,
			name: accountMap[u.userId]?.name || emailUtils.getName(u.email)
		}]));
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
		let { receiverUserId, content } = params;

		receiverUserId = Number(receiverUserId);
		content = (content || '').trim();

		if (!content) {
			throw new BizError(t('emptyMessage'));
		}

		if (content.length > 2000) {
			throw new BizError(t('messageTooLong'));
		}

		if (!await this.isFriend(c, userId, receiverUserId)) {
			throw new BizError(t('notFriend'));
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
			content
		}).returning().get();

		return messageId;
	},

	async listConversations(c, userId) {
		const friends = await this.listFriends(c, userId);
		const result = [];

		for (const f of friends) {
			const last = await orm(c).select().from(privateMessage).where(
				and(eq(privateMessage.isDel, isDel.NORMAL),
					or(
						and(eq(privateMessage.senderUserId, userId), eq(privateMessage.receiverUserId, f.userId)),
						and(eq(privateMessage.senderUserId, f.userId), eq(privateMessage.receiverUserId, userId))
					))).orderBy(desc(privateMessage.messageId)).limit(1).get();

			const { total } = await orm(c).select({ total: count() }).from(privateMessage).where(
				and(
					eq(privateMessage.receiverUserId, userId),
					eq(privateMessage.senderUserId, f.userId),
					eq(privateMessage.isRead, 0),
					eq(privateMessage.isDel, isDel.NORMAL)
				)).get();

			result.push({ ...f, lastMessage: last || null, unread: total || 0 });
		}

		result.sort((a, b) => {
			const ta = a.lastMessage?.createTime || '';
			const tb = b.lastMessage?.createTime || '';
			return tb.localeCompare(ta);
		});

		return result;
	},

	async listMessages(c, params, userId) {
		let { friendUserId, num, size } = params;

		friendUserId = Number(friendUserId);
		size = Number(size);
		num = Number(num);

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

		const list = await orm(c).select().from(privateMessage).where(
			and(eq(privateMessage.isDel, isDel.NORMAL),
				or(
					and(eq(privateMessage.senderUserId, userId), eq(privateMessage.receiverUserId, friendUserId)),
					and(eq(privateMessage.senderUserId, friendUserId), eq(privateMessage.receiverUserId, userId))
				))).orderBy(desc(privateMessage.messageId)).limit(size).offset((num - 1) * size).all();

		await orm(c).update(privateMessage).set({ isRead: 1 }).where(
			and(
				eq(privateMessage.receiverUserId, userId),
				eq(privateMessage.senderUserId, friendUserId),
				eq(privateMessage.isRead, 0)
			)).run();

		return list.reverse();
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
