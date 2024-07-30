import { relations } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'

export const documentVersions = latitudeSchema.table(
  'document_versions',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    documentUuid: uuid('document_uuid').notNull().defaultRandom(),
    path: varchar('path').notNull(),
    content: text('content').notNull().default(''),
    resolvedContent: text('resolved_content'),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id),
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    uniqueDocumentUuidCommitId: unique('unique_document_uuid_commit_id').on(
      table.documentUuid,
      table.commitId,
    ),
    uniquePathCommitId: unique('unique_path_commit_id_deleted_at').on(
      table.path,
      table.commitId,
      table.deletedAt,
    ),
    documentUuidCommitIdIdx: index('document_uuid_commit_id_idx').on(
      table.documentUuid,
      table.commitId,
    ),
  }),
)

export const documentVersionRelations = relations(
  documentVersions,
  ({ one }) => ({
    commit: one(commits, {
      fields: [documentVersions.commitId],
      references: [commits.id],
    }),
  }),
)
