import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';

// 冰面炫舞：房间 + 选手分数。谱面由客户端按房间码当种子生成（同一房间谱面相同），
// 服务端只同步分数，所以这里没有谱面表。
export const danceRoom = sqliteTable('dance_room', {
    code: text('code').primaryKey(),
    hostUserId: integer('host_user_id').notNull(),
    status: text('status').notNull().default('waiting'),
    createdAt: text('created_at'),
    startedAt: integer('started_at')
});

export const dancePlayer = sqliteTable('dance_player', {
    code: text('code').notNull(),
    userId: integer('user_id').notNull(),
    name: text('name').notNull().default(''),
    score: integer('score').notNull().default(0),
    maxCombo: integer('max_combo').notNull().default(0),
    perfect: integer('perfect').notNull().default(0),
    great: integer('great').notNull().default(0),
    good: integer('good').notNull().default(0),
    miss: integer('miss').notNull().default(0),
    finished: integer('finished').notNull().default(0),
    updatedAt: integer('updated_at')
}, (table) => [
    primaryKey({ columns: [table.code, table.userId] })
]);
export default danceRoom
