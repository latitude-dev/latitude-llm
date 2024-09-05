import { bigint, bigserial, index, json, text, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'

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
    parameters: json('parameters').notNull(),
    customIdentifier: text('custom_identifier'),
    duration: bigint('duration', { mode: 'number' }).notNull(),
    ...timestamps(),
  },
  (table) => ({
    documentLogUuidIdx: index('document_log_uuid_idx').on(table.documentUuid),
  }),
)
