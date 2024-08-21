import { bigint, bigserial, index, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { workspaces } from '../models/workspaces'
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
