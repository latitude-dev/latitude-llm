import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { logSourcesEnum } from './providerLogs'

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
    duration: bigint('duration', { mode: 'number' }).notNull(),
    source: logSourcesEnum('source'),
    ...timestamps(),
  },
  (table) => ({
    documentLogOwnUuidIdx: index('document_log_own_uuid_idx').on(table.uuid),
    documentLogUuidIdx: index('document_log_uuid_idx').on(table.documentUuid),
    commitIdIdx: index('document_logs_commit_id_idx').on(table.commitId),
    contentHashIdx: index('document_logs_content_hash_idx').on(
      table.contentHash,
    ),
    createdAtIdx: index('document_logs_created_at_idx').on(table.createdAt),
  }),
)
