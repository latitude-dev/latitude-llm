import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  uniqueIndex,
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
      .references(() => commits.id, { onDelete: 'cascade' }),
    deletedAt: timestamp('deleted_at'),
    ...timestamps(),
  },
  (table) => ({
    uniqueDocumentUuidCommitId: uniqueIndex(
      'document_versions_unique_document_uuid_commit_id',
    ).on(table.documentUuid, table.commitId),
    uniquePathCommitIdDeletedAt: uniqueIndex(
      'document_versions_unique_path_commit_id_deleted_at',
    ).on(table.path, table.commitId, table.deletedAt),
    commitIdIdx: index('document_versions_commit_id_idx').on(table.commitId),
    deletedAtIdx: index('document_versions_deleted_at_idx').on(table.deletedAt),
    pathIdx: index('document_versions_path_idx').on(table.path),
  }),
)
