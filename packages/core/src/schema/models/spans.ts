import { sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  bigint,
  index,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { SpanKind, SpanSource, SpanStatusCode, SpanType } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { apiKeys } from './apiKeys'
import { commits } from './commits'
import { experiments } from './experiments'
import { providerApiKeys } from './providerApiKeys'
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
    parentId: varchar('parent_id', { length: 16 }).references(
      (): AnyPgColumn => spans.id,
      { onDelete: 'cascade' },
    ),
    traceId: varchar('trace_id', { length: 32 }).notNull(),
    externalId: varchar('external_id', { length: 128 }),
    name: varchar('name', { length: 256 }).notNull(),
    kind: varchar('kind', { length: 128 }).notNull().$type<SpanKind>(),
    source: varchar('source', { length: 128 }).notNull().$type<SpanSource>(),
    type: varchar('type', { length: 128 }).notNull().$type<SpanType>(),
    statusCode: varchar('status_code', { length: 128 })
      .notNull()
      .$type<SpanStatusCode>(),
    statusMessage: varchar('status_message', { length: 1024 }),
    metadataUuid: uuid('metadata_uuid').notNull().unique(),
    commitId: bigint('commit_id', { mode: 'number' }).references(
      () => commits.id,
      { onDelete: 'restrict' },
    ),
    documentUuid: uuid('document_uuid'),
    evaluationUuid: uuid('evaluation_uuid'),
    experimentId: bigint('experiment_id', { mode: 'number' }).references(
      () => experiments.id,
      { onDelete: 'set null' },
    ),
    // Denormalized metadata fields - create indexes if necessary
    promptHash: varchar('prompt_hash', { length: 64 }),
    providerId: bigint('provider_id', { mode: 'number' }).references(
      () => providerApiKeys.id,
      { onDelete: 'restrict' },
    ),
    model: varchar('model', { length: 128 }),
    tokens: bigint('tokens', { mode: 'number' }),
    cost: bigint('cost', { mode: 'number' }),
    duration: bigint('duration', { mode: 'number' }),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('spans_workspace_id_idx').on(table.workspaceId),
    apiKeyIdIdx: index('spans_api_key_id_idx').on(table.apiKeyId),
    parentIdIdx: index('spans_parent_id_idx').on(table.parentId),
    traceIdIdx: index('spans_trace_id_idx').on(table.traceId),
    externalIdTrgmIdx: index('spans_external_id_trgm_idx').using(
      'gin',
      sql`${table.externalId} gin_trgm_ops`,
    ),
    metadataUuidIdx: index('spans_metadata_uuid_idx').on(table.metadataUuid),
    commitIdIdx: index('spans_commit_id_idx').on(table.commitId),
    documentUuidIdx: index('spans_document_uuid_idx').on(table.documentUuid),
    evaluationUuidIdx: index('spans_evaluation_uuid_idx').on(
      table.evaluationUuid,
    ),
    experimentIdIdx: index('spans_experiment_id_idx').on(table.experimentId),
    promptHashIdx: index('spans_prompt_hash_idx').on(table.promptHash),
    providerIdIdx: index('spans_provider_id_idx').on(table.providerId),
    modelIdx: index('spans_model_idx').on(table.model),
    startedAtIdx: index('spans_started_at_idx').on(table.startedAt),
    endedAtIdx: index('spans_ended_at_idx').on(table.endedAt),
  }),
)
