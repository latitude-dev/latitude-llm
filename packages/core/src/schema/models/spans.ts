import { bigint, index, timestamp, varchar } from 'drizzle-orm/pg-core'
import { SpanKind, SpanSource, SpanStatusCode, SpanType } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { apiKeys } from './apiKeys'
import { workspaces } from './workspaces'

export const spans = latitudeSchema.table(
  'spans',
  {
    id: varchar('id', { length: 16 }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    apiKeyId: bigint('api_key_id', { mode: 'number' })
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'restrict' }),
    traceId: varchar('trace_id', { length: 32 }).notNull(),
    segmentId: varchar('segment_id', { length: 16 }),
    parentId: varchar('parent_id', { length: 16 }),
    externalId: varchar('external_id', { length: 128 }),
    name: varchar('name', { length: 128 }).notNull(),
    kind: varchar('kind', { length: 128 }).notNull().$type<SpanKind>(),
    source: varchar('source', { length: 128 }).notNull().$type<SpanSource>(),
    type: varchar('type', { length: 128 }).notNull().$type<SpanType>(),
    statusCode: varchar('status_code', { length: 128 })
      .notNull()
      .$type<SpanStatusCode>(),
    statusMessage: varchar('status_message', { length: 1024 }),
    duration: bigint('duration', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at').notNull(),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('spans_workspace_id_idx').on(table.workspaceId),
    apiKeyIdIdx: index('spans_api_key_id_idx').on(table.apiKeyId),
    traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
    segmentIdIdx: index('spans_segment_id_idx').on(table.segmentId),
    parentIdIdx: index('spans_parent_id_idx').on(table.parentId),
    startedAtIdx: index('spans_started_at_idx').on(table.startedAt),
    endedAtIdx: index('spans_ended_at_idx').on(table.endedAt),
  }),
)
