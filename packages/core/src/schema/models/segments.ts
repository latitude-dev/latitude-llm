import { sql } from 'drizzle-orm'
import { bigint, index, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { SegmentType, SpanSource, SpanStatusCode } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { apiKeys } from './apiKeys'
import { commits } from './commits'
import { documentTypesEnum } from './documentVersions'
import { experiments } from './experiments'
import { workspaces } from './workspaces'

export const segments = latitudeSchema.table(
  'segments',
  {
    id: varchar('id', { length: 16 }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    apiKeyId: bigint('api_key_id', { mode: 'number' })
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'restrict' }),
    traceId: varchar('trace_id', { length: 32 }).notNull(),
    parentId: varchar('parent_id', { length: 16 }),
    externalId: varchar('external_id', { length: 128 }),
    name: varchar('name', { length: 128 }).notNull(),
    source: varchar('source', { length: 128 }).notNull().$type<SpanSource>(),
    type: varchar('type', { length: 128 }).notNull().$type<SegmentType>(),
    statusCode: varchar('status_code', { length: 128 })
      .notNull()
      .$type<SpanStatusCode>(),
    statusMessage: varchar('status_message', { length: 1024 }),
    // Denormalized fields for filtering and aggregation
    commitUuid: uuid('commit_uuid').references(() => commits.uuid, {
      onDelete: 'restrict',
    }),
    documentUuid: uuid('document_uuid'),
    documentType: documentTypesEnum('document_type'),
    experimentUuid: uuid('experiment_uuid').references(() => experiments.uuid, {
      onDelete: 'set null',
    }),
    promptHash: varchar('prompt_hash', { length: 64 }),
    provider: varchar('provider', { length: 128 }),
    model: varchar('model', { length: 128 }),
    tokens: bigint('tokens', { mode: 'number' }),
    cost: bigint('cost', { mode: 'number' }),
    duration: bigint('duration', { mode: 'number' }).notNull(),
    startedAt: timestamp('started_at').notNull(),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('segments_workspace_id_idx').on(table.workspaceId),
    apiKeyIdIdx: index('segments_api_key_id_idx').on(table.apiKeyId),
    traceIdIdx: index('segments_trace_id_idx').on(table.traceId),
    parentIdIdx: index('segments_parent_id_idx').on(table.parentId),
    externalIdTrgmIdx: index('segments_external_id_trgm_idx').using(
      'gin',
      sql`${table.externalId} gin_trgm_ops`,
    ),
    commitUuidIdx: index('segments_commit_uuid_idx').on(table.commitUuid),
    documentUuidIdx: index('segments_document_uuid_idx').on(table.documentUuid),
    experimentUuidIdx: index('segments_experiment_uuid_idx').on(
      table.experimentUuid,
    ),
    promptHashIdx: index('segments_prompt_hash_idx').on(table.promptHash),
    providerIdx: index('segments_provider_idx').on(table.provider),
    modelIdx: index('segments_model_idx').on(table.model),
    startedAtIdx: index('segments_started_at_idx').on(table.startedAt),
    updatedAtIdx: index('segments_updated_at_idx').on(table.updatedAt),
  }),
)
