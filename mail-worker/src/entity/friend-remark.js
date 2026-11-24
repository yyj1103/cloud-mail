import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';

// 好友备注：每人给每个好友单独起的名字，只自己看得见。
// 不能存在 friend 表那一行上——一对好友只有一行，但两边的备注各不相同，
// 所以单独一张表，以 (user_id, friend_user_id) 为主键。
export const friendRemark = sqliteTable('friend_remark', {
    userId: integer('user_id').notNull(),
    friendUserId: integer('friend_user_id').notNull(),
    remark: text('remark').notNull().default(''),
    updateTime: text('update_time')
}, (table) => [
    primaryKey({ columns: [table.userId, table.friendUserId] })
]);
export default friendRemark
