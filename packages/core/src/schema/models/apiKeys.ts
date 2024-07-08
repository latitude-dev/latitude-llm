import { InferSelectModel } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'

export const apiKeys = latitudeSchema.table(
  'api_keys',
  {
    id: bigserial('id', { mode: 'bigint' }).notNull().primaryKey(),
    uuid: uuid('uuid')
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: bigint('workspace_id', { mode: 'bigint' })
      .notNull()
      .references(() => workspaces.id),
    name: varchar('name', { length: 256 }),
    ...timestamps(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    workspaceIdIdx: index('workspace_id_idx').on(table.workspaceId),
  }),
)

export type ApiKey = InferSelectModel<typeof apiKeys>
