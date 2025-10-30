import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { projects } from './projects'
import { workspaces } from './workspaces'

export const issues = latitudeSchema.table(
  'issues',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    description: text('description').notNull(),
    resolvedAt: timestamp('resolved_at'),
    ignoredAt: timestamp('ignored_at'),
    ...timestamps(),
  },
  (table) => [
    index('issues_workspace_id_idx').on(table.workspaceId),
    index('issues_project_id_idx').on(table.projectId),
    index('issues_document_uuid_idx').on(table.documentUuid),
    index('issues_title_trgm_idx').using(
      'gin',
      sql`${table.title} gin_trgm_ops`,
    ),
    index('issues_resolved_at_idx').on(table.resolvedAt),
    index('issues_ignored_at_idx').on(table.ignoredAt),
  ],
)
