import { sql } from 'drizzle-orm'
import { bigint, bigserial, index, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { users } from './users'
import { workspaces } from './workspaces'

export const latteThreads = latitudeSchema.table(
  'latte_threads',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().default(sql`gen_random_uuid()`), // Points to a document log uuid
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (thread) => ({
    uuidIndex: uniqueIndex('latte_threads_uuid_index').on(thread.uuid),
    userWorkspaceIndex: index('latte_threads_user_workspace_index').on(
      thread.userId,
      thread.workspaceId,
    ),
  }),
)
