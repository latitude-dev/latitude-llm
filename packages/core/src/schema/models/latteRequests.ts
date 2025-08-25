import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  index,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { latteThreads } from './latteThreads'
import { users } from './users'
import { workspaces } from './workspaces'

export const latteRequests = latitudeSchema.table(
  'latte_requests',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(), // Idempotency key
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    threadUuid: uuid('thread_uuid')
      .notNull()
      .references(() => latteThreads.uuid, { onDelete: 'restrict' }),
    credits: bigint('credits', { mode: 'number' }).notNull(),
    billable: boolean('billable').notNull(),
    error: varchar('error', { length: 256 }),
    ...timestamps(),
  },
  (table) => ({
    // idIdx Note: already done with the primary key
    // uuidIdx Note: already done with the unique constraint
    workspaceIdIdx: index('latte_requests_workspace_id_idx').on(
      table.workspaceId,
    ),
    userIdIdx: index('latte_requests_user_id_idx').on(table.userId),
    threadUuidIdx: index('latte_requests_thread_uuid_idx').on(table.threadUuid),
    // Note: literally performing SQL injection in the migration to be able to create a
    // covering index for the SUM credits query because drizzle does not support them yet
    creditsIdx: index('latte_requests_credits_idx').on(
      table.workspaceId,
      sql`${table.createdAt}) INCLUDE (${table.credits}, ${table.billable}`,
    ),
    createdAtIdx: index('latte_requests_created_at_idx').on(table.createdAt),
    createdAtBrinIdx: index('latte_requests_created_at_brin_idx')
      .using('brin', sql`${table.createdAt}`)
      .with({ pages_per_range: 32, autosummarize: true }),
  }),
)
