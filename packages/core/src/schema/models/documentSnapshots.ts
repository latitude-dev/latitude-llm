import { InferSelectModel, relations } from 'drizzle-orm'
import { AnyPgColumn, bigint, bigserial, index } from 'drizzle-orm/pg-core'

import {
  Commit,
  commits,
  DocumentVersion,
  documentVersions,
  latitudeSchema,
} from '..'
import { timestamps } from '../schemaHelpers'

export const documentSnapshots = latitudeSchema.table(
  'document_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    commitId: bigint('commit_id', { mode: 'number' })
      .references((): AnyPgColumn => commits.id, { onDelete: 'restrict' })
      .notNull(),
    DocumentVersionId: bigint('document_version_id', { mode: 'number' })
      .references((): AnyPgColumn => documentVersions.id, {
        onDelete: 'restrict',
      })
      .notNull(),
    ...timestamps(),
  },
  (doc) => ({
    commitIdx: index('prompt_commit_idx').on(doc.commitId),
    DocumentVersionIdx: index('document_snapshot_document_version_idx').on(
      doc.DocumentVersionId,
    ),
  }),
)

export const documentSnapshotRelations = relations(
  documentSnapshots,
  ({ one }) => ({
    commit: one(commits, {
      relationName: 'snapshots',
      fields: [documentSnapshots.commitId],
      references: [commits.id],
    }),
    version: one(documentVersions, {
      fields: [documentSnapshots.DocumentVersionId],
      references: [documentVersions.id],
    }),
  }),
)

export type DocumentSnapshot = InferSelectModel<typeof documentSnapshots> & {
  commit: Commit
  version: DocumentVersion
}
