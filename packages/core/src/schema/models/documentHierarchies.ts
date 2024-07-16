import { InferSelectModel, relations } from 'drizzle-orm'
import { bigint, bigserial, integer } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

// This table is used to store the hierarchy of documents. It follows the
// closure table pattern which trades memory space for best-in-class reads and
// writes. This table is kept up to date via postgres triggers, so you should
// never have to manually update it.
//
// More info: https://fueled.com/the-cache/posts/backend/closure-table/
export const documentHierarchies = latitudeSchema.table(
  'document_hierarchies',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    parentId: bigint('parent_id', { mode: 'number' }),
    depth: integer('depth').notNull(),
    childId: bigint('child_id', { mode: 'number' }).notNull(),
    ...timestamps(),
  },
)

export const documentHierarychyRelations = relations(
  documentHierarchies,
  ({ one }) => ({
    parent: one(documentHierarchies, {
      fields: [documentHierarchies.parentId],
      references: [documentHierarchies.id],
    }),
    child: one(documentHierarchies, {
      fields: [documentHierarchies.childId],
      references: [documentHierarchies.id],
    }),
  }),
)

export type DocumentHierarchy = InferSelectModel<typeof documentHierarchies>
