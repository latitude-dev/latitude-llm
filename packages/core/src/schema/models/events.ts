import { bigint, bigserial, index, jsonb, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'

export const events = latitudeSchema.table(
  'events',
  {
    id: bigserial('id', { mode: 'number' }),
    workspaceId: bigint('workspace_id', { mode: 'number' }).references(() => workspaces.id),
    type: varchar('type', { length: 256 }).notNull(),
    data: jsonb('data').notNull(),
    ...timestamps(),
  },
  (table) => ({
    eventWorkspaceIdx: index('event_workspace_idx').on(table.workspaceId),
    eventTypeIdx: index('event_type_idx').on(table.type),
  }),
)
