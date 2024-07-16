import { DocumentType } from '$core/constants'
import { InferSelectModel, relations } from 'drizzle-orm'
import {
  AnyPgColumn,
  bigint,
  bigserial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'

export const documentTypeEnum = latitudeSchema.enum('document_type', [
  DocumentType.Document,
  DocumentType.Folder,
])

export const documentVersions = latitudeSchema.table('document_versions', {
  id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
  name: varchar('name').notNull(),
  documentType: documentTypeEnum('document_type')
    .notNull()
    .default(DocumentType.Document),
  content: text('content'),
  hash: varchar('hash'),
  deletedAt: timestamp('deleted_at'),
  documentUuid: uuid('document_uuid').notNull().defaultRandom(),
  parentId: bigint('parent_id', { mode: 'number' }).references(
    (): AnyPgColumn => documentVersions.id,
    { onDelete: 'cascade' },
  ),
  commitId: bigint('commit_id', { mode: 'number' })
    .notNull()
    .references(() => commits.id),
  ...timestamps(),
})

export const documentVersionRelations = relations(
  documentVersions,
  ({ one }) => ({
    commit: one(commits, {
      fields: [documentVersions.commitId],
      references: [commits.id],
    }),
    parent: one(documentVersions, {
      fields: [documentVersions.parentId],
      references: [documentVersions.id],
      relationName: 'parent',
    }),
  }),
)

export const documentTypeEnumSchema = z.enum(documentTypeEnum.enumValues)
export type DocumentVersion = InferSelectModel<typeof documentVersions>
