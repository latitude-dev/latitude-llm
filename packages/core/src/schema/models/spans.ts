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
    documentUuid: uuid('document_uuid'),
    commitUuid: uuid('commit_uuid'),
    experimentId: bigint('experiment_id', { mode: 'number' }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.traceId, table.id] }),
    index('spans_id_idx').on(table.id),
    index('spans_trace_id_idx').on(table.traceId),
    index('spans_document_log_uuid_idx').on(table.documentLogUuid),
    // traceIdIdIdx Note: already done with the primary key
    index('spans_parent_id_idx').on(table.parentId),
    index('spans_workspace_id_idx').on(table.workspaceId),
    index('spans_api_key_id_idx').on(table.apiKeyId),
    index('spans_type_started_at_idx').on(table.type, table.startedAt),
    index('spans_status_started_at_idx').on(table.status, table.startedAt),
    index('spans_started_at_idx').on(table.startedAt),
    index('spans_started_at_brin_idx')
      .using('brin', sql`${table.startedAt}`)
      .with({ pages_per_range: 32, autosummarize: true }),
    index('spans_document_uuid_idx').on(table.documentUuid),
    index('spans_commit_uuid_idx').on(table.commitUuid),
    index('spans_experiment_id_idx').on(table.experimentId),
  ],
)
