import {
  bigint,
  bigserial,
  foreignKey,
  index,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { documentVersions } from './documentVersions'
import { evaluations } from './evaluations'
import { workspaces } from './workspaces'

export const documentSuggestions = latitudeSchema.table(
  'document_suggestions',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' }).notNull(),
    documentUuid: uuid('document_uuid').notNull(),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }),
    oldPrompt: text('old_prompt').notNull(),
    newPrompt: text('new_prompt').notNull(),
    summary: text('summary').notNull(),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('document_suggestions_workspace_id_idx').on(
      table.workspaceId,
    ),
    documentVersionsFk: foreignKey({
      columns: [table.commitId, table.documentUuid],
      foreignColumns: [
        documentVersions.commitId,
        documentVersions.documentUuid,
      ],
      name: 'document_suggestions_document_versions_fk',
    }).onDelete('cascade'),
    commitIdIdx: index('document_suggestions_commit_id_idx').on(table.commitId),
    documentUuidIdx: index('document_suggestions_document_uuid_idx').on(
      table.documentUuid,
    ),
    evaluationIdIdx: index('document_suggestions_evaluation_id_idx').on(
      table.evaluationId,
    ),
    createdAtIdx: index('document_suggestions_created_at_idx').on(
      table.createdAt,
    ),
  }),
)
