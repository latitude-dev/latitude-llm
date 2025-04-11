import {
  bigint,
  bigserial,
  index,
  jsonb,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from '../models/workspaces'

export const traces = latitudeSchema.table(
  'traces',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    traceId: varchar('trace_id', { length: 32 }).notNull().unique(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 256 }),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),
    attributes:
      jsonb('attributes').$type<Record<string, string | number | boolean>>(),
    status: varchar('status', { length: 64 }),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('traces_workspace_id_idx').on(table.workspaceId),
    traceIdIdx: index('traces_trace_id_idx').on(table.traceId),
    startTimeIdx: index('traces_start_time_idx').on(table.startTime),
  }),
)
