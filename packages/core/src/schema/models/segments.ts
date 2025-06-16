import { isNotNull, sql } from 'drizzle-orm'
import { bigint, index, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import {
  DocumentType,
  SegmentSource,
  SegmentType,
  SpanStatus,
} from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { apiKeys } from './apiKeys'
import { commits } from './commits'
import { documentLogs } from './documentLogs'
import { experiments } from './experiments'
import { workspaces } from './workspaces'

export const segments = latitudeSchema.table(
  'segments',
  {
    id: uuid('id').notNull().primaryKey(),
    traceId: varchar('trace_id', { length: 32 }).notNull(),
    parentId: uuid('parent_id'),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    apiKeyId: bigint('api_key_id', { mode: 'number' })
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'restrict' }),
    externalId: varchar('external_id', { length: 32 }),
    name: varchar('name', { length: 128 }).notNull(),
    source: varchar('source', { length: 32 }).notNull().$type<SegmentSource>(),
    type: varchar('type', { length: 32 }).notNull().$type<SegmentType>(),
    status: varchar('status', { length: 32 }).notNull().$type<SpanStatus>(),
    message: varchar('message', { length: 256 }),
    // Denormalized fields for filtering and aggregation
    // TODO(tracing): temporal related log, remove when observability is ready
    logUuid: uuid('log_uuid').references(() => documentLogs.uuid, {
      onDelete: 'set null',
    }),
    commitUuid: uuid('commit_uuid')
      .references(() => commits.uuid, { onDelete: 'restrict' })
      .notNull(),
    documentUuid: uuid('document_uuid').notNull(),
    documentHash: varchar('document_hash', { length: 64 }).notNull(),
    documentType: varchar('document_type', { length: 32 })
      .notNull()
      .$type<DocumentType>(),
    experimentUuid: uuid('experiment_uuid').references(() => experiments.uuid, {
      onDelete: 'set null',
    }),
    provider: varchar('provider', { length: 128 }).notNull(),
    model: varchar('model', { length: 128 }).notNull(),
    tokens: bigint('tokens', { mode: 'number' }).notNull(),
    cost: bigint('cost', { mode: 'number' }).notNull(),
    duration: bigint('duration', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    ...timestamps(),
  },
  (table) => ({
    traceIdIdx: index('segments_trace_id_idx').on(table.traceId),
    traceIdIdIdx: index('segments_trace_id_id_idx').on(table.traceId, table.id),
    parentIdIdx: index('segments_parent_id_idx').on(table.parentId),
    workspaceIdIdx: index('segments_workspace_id_idx').on(table.workspaceId),
    apiKeyIdIdx: index('segments_api_key_id_idx').on(table.apiKeyId),
    externalIdIdx: index('segments_external_id_idx').on(table.externalId),
    externalIdTrgmIdx: index('segments_external_id_trgm_idx').using(
      'gin',
      sql`${table.externalId} gin_trgm_ops`,
    ),
    sourceStartedAtIdx: index('segments_source_started_at_idx').on(
      table.source,
      table.startedAt,
    ),
    typeStartedAtIdx: index('segments_type_started_at_idx').on(
      table.type,
      table.startedAt,
    ),
    statusStartedAtIdx: index('segments_status_started_at_idx').on(
      table.status,
      table.startedAt,
    ),
    // TODO(tracing): temporal related log, remove when observability is ready
    logUuidIdx: index('segments_log_uuid_idx').on(table.logUuid),
    commitUuidIdx: index('segments_commit_uuid_idx').on(table.commitUuid),
    documentUuidIdx: index('segments_document_uuid_idx').on(table.documentUuid),
    documentHashIdx: index('segments_document_hash_idx').on(table.documentHash),
    experimentUuidIdx: index('segments_experiment_uuid_idx').on(
      table.experimentUuid,
    ),
    providerIdx: index('segments_provider_idx').on(table.provider),
    modelIdx: index('segments_model_idx').on(table.model),
    startedAtIdx: index('segments_started_at_idx').on(table.startedAt),
    startedAtBrinIdx: index('segments_started_at_brin_idx')
      .using('brin', sql`${table.startedAt}`)
      .with({ pages_per_range: 32, autosummarize: true }),
    endedAtPartialIdx: index('segments_ended_at_partial_idx')
      .on(table.endedAt)
      .where(isNotNull(table.endedAt)),
  }),
)
