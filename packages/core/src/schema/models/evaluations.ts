import { relations } from 'drizzle-orm'
import { bigint, bigserial, index, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema, workspaces } from '..'
import { timestamps } from '../schemaHelpers'
import { evaluationTemplates } from './evaluationTemplates'

export const evaluations = latitudeSchema.table(
  'evaluations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    prompt: text('prompt').notNull(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    templateId: bigint('template_id', { mode: 'number' }).references(
      () => evaluationTemplates.id,
    ),
    ...timestamps(),
  },
  (table) => ({
    evaluationWorkspaceIdx: index('evaluation_workspace_idx').on(
      table.workspaceId,
    ),
  }),
)

export const evaluationRelations = relations(evaluations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [evaluations.workspaceId],
    references: [workspaces.id],
  }),
}))
