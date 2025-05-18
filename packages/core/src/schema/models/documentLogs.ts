import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { sql } from 'drizzle-orm'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { logSourcesEnum } from './providerLogs'
import { LogSources } from '@latitude-data/constants'
import { experiments } from './experiments'

export const documentLogs = latitudeSchema.table(
  'document_logs',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique(),
    documentUuid: uuid('document_uuid').notNull(),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    resolvedContent: text('resolved_content').notNull(),
    contentHash: text('content_hash').notNull(),
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull(),
    customIdentifier: text('custom_identifier'),
    duration: bigint('duration', { mode: 'number' }),
    source: logSourcesEnum('source').$type<LogSources>(),
    experimentId: bigint('experiment_id', { mode: 'number' }).references(
      () => experiments.id,
      {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ),
    ...timestamps(),
  },
  (table) => ({
    documentLogUuidIdx: index('document_log_uuid_idx').on(table.uuid),
    documentLogDocumentUuidIdx: index('document_log_document_uuid_idx').on(
      table.documentUuid,
    ),
    commitIdIdx: index('document_logs_commit_id_idx').on(table.commitId),
    contentHashIdx: index('document_logs_content_hash_idx').on(
      table.contentHash,
    ),
    createdAtIdx: index('document_logs_created_at_idx').on(table.createdAt),
    customIdentifierTrgmIdx: index('document_logs_custom_identifier_trgm_idx')
      .using('gin', sql`${table.customIdentifier} gin_trgm_ops`)
      .concurrently(),
    commitCreatedAtIdx: index('document_logs_commit_created_at_idx').on(
      table.commitId,
      table.createdAt,
    ),
    experimentIdIdx: index('document_logs_experiment_id_idx').on(
      table.experimentId,
    ),
  }),
)
