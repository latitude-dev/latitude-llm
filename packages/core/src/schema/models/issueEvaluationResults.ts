import {
  AnyPgColumn,
  bigint,
  bigserial,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { issues } from './issues'
import { workspaces } from './workspaces'

export const issueEvaluationResults = latitudeSchema.table(
  'issue_evaluation_results',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    issueId: bigint('issue_id', { mode: 'number' })
      .notNull()
      .references((): AnyPgColumn => issues.id, { onDelete: 'cascade' }),
    evaluationResultId: bigint('evaluation_result_id', {
      mode: 'number',
    }).notNull(),
    ...timestamps(),
  },
  (table) => [
    index('issue_evaluation_results_workspace_id_idx').on(table.workspaceId),
    index('issue_evaluation_results_issue_id_idx').on(table.issueId),
    index('issue_evaluation_results_evaluation_result_id_idx').on(
      table.evaluationResultId,
    ),
    // Unique constraint: an evaluation result can only be associated with an issue once
    uniqueIndex('issue_evaluation_results_unique_issue_eval_idx').on(
      table.issueId,
      table.evaluationResultId,
    ),
  ],
)
