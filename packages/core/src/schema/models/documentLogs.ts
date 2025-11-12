import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { LogSources } from '@latitude-data/constants'
import { sql } from 'drizzle-orm'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { experiments } from './experiments'
import { workspaces } from './workspaces'
import { logSourcesEnum } from './providerLogs'

export const documentLogs = latitudeSchema.table(
  'document_logs',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique(),
    workspaceId: bigint('workspace_id', { mode: 'number' }).references(
      () => workspaces.id,
      { onDelete: 'cascade' },
    ),
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
  (table) => [
    index('document_log_uuid_idx').on(table.uuid),
    index('document_log_document_uuid_idx').on(table.documentUuid),
    index('document_logs_workspace_idx').on(table.workspaceId),
    index('document_logs_commit_id_idx').on(table.commitId),
    index('document_logs_content_hash_idx').on(table.contentHash),
    index('document_logs_created_at_idx').on(table.createdAt),
    index('document_logs_custom_identifier_trgm_idx')
      .using('gin', sql`${table.customIdentifier} gin_trgm_ops`)
      .concurrently(),
    index('document_logs_commit_created_at_idx').on(
      table.commitId,
      table.createdAt,
    ),
    index('document_logs_source_created_at_idx')
      .on(table.source, table.createdAt)
      .concurrently(),
    index('document_logs_experiment_id_idx').on(table.experimentId),
    index('document_logs_created_at_brin_idx')
      .using('brin', sql`${table.createdAt}`)
      .with({
        pages_per_range: 32,
        autosummarize: true,
      })
      .concurrently(),
  ],
)
