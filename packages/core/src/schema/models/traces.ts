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
import { projects } from './projects'

export const traces = latitudeSchema.table(
  'traces',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    traceId: varchar('trace_id', { length: 32 }).notNull().unique(),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 256 }),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),
    attributes:
      jsonb('attributes').$type<Record<string, string | number | boolean>>(),
    status: varchar('status', { length: 64 }),
    ...timestamps(),
  },
  (table) => ({
    projectIdIdx: index('traces_project_id_idx').on(table.projectId),
    traceIdIdx: index('traces_trace_id_idx').on(table.traceId),
    startTimeIdx: index('traces_start_time_idx').on(table.startTime),
  }),
)
