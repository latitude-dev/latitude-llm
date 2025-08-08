import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { SpanKind, SpanStatus, SpanType } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { apiKeys } from './apiKeys'
import { workspaces } from './workspaces'

export const spans = latitudeSchema.table(
  'spans',
  {
    id: varchar('id', { length: 16 }).notNull(),
    traceId: varchar('trace_id', { length: 32 }).notNull(),
    documentLogUuid: uuid('document_log_uuid'),
    parentId: varchar('parent_id', { length: 16 }),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    apiKeyId: bigint('api_key_id', { mode: 'number' })
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 128 }).notNull(),
    kind: varchar('kind', { length: 32 }).notNull().$type<SpanKind>(),
    type: varchar('type', { length: 32 }).notNull().$type<SpanType>(),
    status: varchar('status', { length: 32 }).notNull().$type<SpanStatus>(),
    message: varchar('message', { length: 256 }),
    duration: bigint('duration', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at').notNull(),
    ...timestamps(),
  },
  (table) => ({
    primaryKey: primaryKey({ columns: [table.traceId, table.id] }),
    idIdx: index('spans_id_idx').on(table.id),
    traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
    documentLogUuidIdx: index('spans_document_log_uuid_idx').on(
      table.documentLogUuid,
    ),
    // traceIdIdIdx Note: already done with the primary key
    parentIdIdx: index('spans_parent_id_idx').on(table.parentId),
    workspaceIdIdx: index('spans_workspace_id_idx').on(table.workspaceId),
    apiKeyIdIdx: index('spans_api_key_id_idx').on(table.apiKeyId),
    typeStartedAtIdx: index('spans_type_started_at_idx').on(
      table.type,
      table.startedAt,
    ),
    statusStartedAtIdx: index('spans_status_started_at_idx').on(
      table.status,
      table.startedAt,
    ),
    startedAtIdx: index('spans_started_at_idx').on(table.startedAt),
    startedAtBrinIdx: index('spans_started_at_brin_idx')
      .using('brin', sql`${table.startedAt}`)
      .with({ pages_per_range: 32, autosummarize: true }),
  }),
)
