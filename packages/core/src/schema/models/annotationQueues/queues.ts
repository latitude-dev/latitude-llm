import { bigint, bigserial, index, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../../db-schema'
import { timestamps } from '../../schemaHelpers'
import { projects } from '../projects'
import { workspaces } from '../workspaces'

export const annotationQueues = latitudeSchema.table(
  'annotation_queues',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description'),
    ...timestamps(),
  },
  (table) => [
    index('annotation_queues_workspace_id_idx').on(table.workspaceId),
    index('annotation_queues_project_id_idx').on(table.projectId),
  ],
)
