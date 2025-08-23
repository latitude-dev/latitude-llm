import { sql } from 'drizzle-orm'
import { bigint, bigserial, index, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'

export const apiKeys = latitudeSchema.table(
  'api_keys',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    token: uuid('token').notNull().unique().default(sql`gen_random_uuid()`),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id),
    name: varchar('name', { length: 256 }),
    lastUsedAt: timestamp('last_used_at'),
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_id_idx').on(table.workspaceId),
  }),
)
