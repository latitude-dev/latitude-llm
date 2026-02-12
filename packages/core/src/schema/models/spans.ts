import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { LogSources, SpanKind, SpanStatus, SpanType } from '../../constants'
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
    // FIXME: remove this column when no occurences of it are left in the codebase.
    previousTraceId: varchar('previous_trace_id', { length: 32 }),
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
    message: varchar('message'),
    duration: bigint('duration', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at').notNull(),

    documentUuid: uuid('document_uuid'),
    commitUuid: uuid('commit_uuid'),
    experimentUuid: uuid('experiment_uuid'),
    projectId: bigint('project_id', { mode: 'number' }),

    source: varchar('source', { length: 32 }).$type<LogSources>(),

    testDeploymentId: bigint('test_deployment_id', { mode: 'number' }),

    tokensPrompt: integer('tokens_prompt'),
    tokensCached: integer('tokens_cached'),
    tokensReasoning: integer('tokens_reasoning'),
    tokensCompletion: integer('tokens_completion'),

    model: varchar('model'),
    cost: integer('cost'),

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
    index('spans_experiment_uuid_idx').on(table.experimentUuid),
    index('spans_test_deployment_id_idx').on(table.testDeploymentId),
    // Composite index for efficient project-scoped queries with pagination
    // Covers: workspace_id + commit_uuid + started_at DESC + id DESC
    index('spans_workspace_commit_started_at_id_idx').on(
      table.workspaceId,
      table.commitUuid,
      table.startedAt,
      table.id,
    ),
    index('spans_previous_trace_id_idx').on(table.previousTraceId),
    index('spans_workspace_type_source_idx').on(
      table.workspaceId,
      table.type,
      table.source,
    ),
    index('spans_workspace_started_at_idx').on(
      table.workspaceId,
      table.startedAt,
    ),
  ],
)
