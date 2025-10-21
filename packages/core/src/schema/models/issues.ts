import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  timestamp,
  varchar,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'
import { projects } from './projects'
import { commits } from './commits'
import { evaluationResultsV2 } from './evaluationResultsV2'

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
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    documentUuid: uuid('document_uuid').notNull(),
    title: varchar('title', { length: 256 }).notNull(),
    description: text('description').notNull(),
    firstSeenResultId: bigint('first_seen_result_id', {
      mode: 'number',
    }).references(() => evaluationResultsV2.id, { onDelete: 'set null' }),
    firstSeenAt: timestamp('first_seen_at').notNull(),
    lastSeenResultId: bigint('last_seen_result_id', {
      mode: 'number',
    }).references(() => evaluationResultsV2.id, { onDelete: 'set null' }),
    lastSeenAt: timestamp('last_seen_at').notNull(),
    resolvedAt: timestamp('resolved_at'),
    ignoredAt: timestamp('ignored_at'),
    ...timestamps(),
  },
  (table) => [
    index('issues_workspace_id_idx').on(table.workspaceId),
    index('issues_project_id_idx').on(table.projectId),
    index('issues_commit_id_idx').on(table.commitId),
    index('issues_document_uuid_idx').on(table.documentUuid),
    index('issues_title_trgm_idx').using(
      'gin',
      sql`${table.title} gin_trgm_ops`,
    ),
    index('issues_first_seen_result_id_idx').on(table.firstSeenResultId),
    index('issues_first_seen_at_idx').on(table.firstSeenAt),
    index('issues_last_seen_result_id_idx').on(table.lastSeenResultId),
    index('issues_last_seen_at_idx').on(table.lastSeenAt),
    index('issues_resolved_at_idx').on(table.resolvedAt),
    index('issues_ignored_at_idx').on(table.ignoredAt),
  ],
)
