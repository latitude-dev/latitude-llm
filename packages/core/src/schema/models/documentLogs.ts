import { relations } from 'drizzle-orm'
import { bigint, bigserial, json, text, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { providerLogs } from './providerLogs'

export const documentLogs = latitudeSchema.table('document_logs', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  uuid: uuid('uuid').notNull().unique(),
  documentUuid: uuid('document_uuid').notNull(), // document_uuid cannot be a reference to document_versions, because it is not a unique field
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
})

export const documentLogsRelations = relations(
  documentLogs,
  ({ one, many }) => ({
    commit: one(commits, {
      fields: [documentLogs.commitId],
      references: [commits.id],
    }),
    providerLogs: many(providerLogs, {
      relationName: 'providerLogDocumentLog',
    }),
  }),
)
