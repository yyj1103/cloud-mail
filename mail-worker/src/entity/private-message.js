import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const privateMessage = sqliteTable('private_message', {
	messageId: integer('message_id').primaryKey({ autoIncrement: true }),
	senderUserId: integer('sender_user_id').notNull(),
	receiverUserId: integer('receiver_user_id').notNull(),
	content: text('content').notNull(),
	type: integer('type').default(0).notNull(),
	replyToMessageId: integer('reply_to_message_id').default(0).notNull(),
	isEdited: integer('is_edited').default(0).notNull(),
	isRead: integer('is_read').default(0).notNull(),
	createTime: text('create_time').notNull().default(sql`CURRENT_TIMESTAMP`),
	isDel: integer('is_del').default(0).notNull()
});
export default privateMessage
