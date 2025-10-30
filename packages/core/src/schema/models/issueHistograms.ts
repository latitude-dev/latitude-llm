import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  unique,
} from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { issues } from './issues'
import { workspaces } from './workspaces'

export const issueHistograms = latitudeSchema.table(
  'issue_histograms',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    issueId: bigint('issue_id', { mode: 'number' })
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'restrict' }),
    date: date('date').notNull(),
    count: integer('count').notNull(),
    ...timestamps(),
  },
  (table) => [
    index('issue_histograms_workspace_id_idx').on(table.workspaceId),
    index('issue_histograms_issue_id_idx').on(table.issueId),
    index('issue_histograms_commit_id_idx').on(table.commitId),
    index('issue_histograms_date_idx').on(table.date),
    index('issue_histograms_date_brin_idx')
      .using('brin', sql`${table.date}`)
      .with({ pages_per_range: 32, autosummarize: true }),
    unique('issue_histograms_unique_issue_commit_date').on(
      table.issueId,
      table.commitId,
      table.date,
    ),
  ],
)
