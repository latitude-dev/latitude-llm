import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { IssueCentroid } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { projects } from './projects'
import { workspaces } from './workspaces'

export const issues = latitudeSchema.table(
  'issues',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    description: text('description').notNull(),
    centroid: jsonb('centroid').notNull().$type<IssueCentroid>(),
    resolvedAt: timestamp('resolved_at'),
    ignoredAt: timestamp('ignored_at'),
    mergedAt: timestamp('merged_at'),
    ...timestamps(),
  },
  (table) => [
    // table.uuid already has an index by the unique constraint
    index('issues_workspace_id_idx').on(table.workspaceId),
    index('issues_project_id_idx').on(table.projectId),
    index('issues_document_uuid_idx').on(table.documentUuid),
    index('issues_title_trgm_idx').using(
      'gin',
      sql`${table.title} gin_trgm_ops`,
    ),
    index('issues_resolved_at_idx').on(table.resolvedAt),
    index('issues_ignored_at_idx').on(table.ignoredAt),
    index('issues_merged_at_idx').on(table.mergedAt),
  ],
)
