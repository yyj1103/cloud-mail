import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const friend = sqliteTable('friend', {
	friendId: integer('friend_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	friendUserId: integer('friend_user_id').notNull(),
	status: integer('status').default(0).notNull(),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`),
	updateTime: text('update_time')
});
export default friend
