import { sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  EvaluationResultError,
  EvaluationResultMetadata,
  EvaluationType,
} from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { datasetRows } from './datasetRows'
import { datasets } from './datasets'
import { experiments } from './experiments'
import { providerLogs } from './providerLogs'
import { workspaces } from './workspaces'
import { issues } from './issues'

export const evaluationResultsV2 = latitudeSchema.table(
  'evaluation_results_v2',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').notNull().unique().defaultRandom(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'restrict' }),
    evaluationUuid: uuid('evaluation_uuid').notNull(),
    evaluationType: varchar('evaluation_type', { length: 32 }).$type<EvaluationType>(),
    evaluationMetric: varchar('evaluation_metric', { length: 64 }),
    experimentId: bigint('experiment_id', { mode: 'number' }).references(
      () => experiments.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    datasetId: bigint('dataset_id', { mode: 'number' }).references(
      () => datasets.id,
      { onDelete: 'set null' },
    ),
    evaluatedRowId: bigint('evaluated_row_id', { mode: 'number' }).references(
      () => datasetRows.id,
      { onDelete: 'set null' },
    ),
    evaluatedLogId: bigint('evaluated_log_id', { mode: 'number' }).references(
      () => providerLogs.id,
      { onDelete: 'cascade' },
    ),
    evaluatedSpanId: varchar('evaluated_span_id', { length: 16 }),
    evaluatedTraceId: varchar('evaluated_trace_id', { length: 32 }),
    // TODO: Remove `issueId` after we've backfilled
    // existing data into issueEvaluationResults
    issueId: bigint('issue_id', { mode: 'number' }).references(
      (): AnyPgColumn => issues.id,
      { onDelete: 'set null' },
    ),
    score: bigint('score', { mode: 'number' }),
    normalizedScore: bigint('normalized_score', { mode: 'number' }),
    metadata: jsonb('metadata').$type<EvaluationResultMetadata>(),
    hasPassed: boolean('has_passed'),
    error: jsonb('error').$type<EvaluationResultError>(),
    // Denormalized metadata fields - create indexes if necessary
    usedForSuggestion: boolean('used_for_suggestion'),
    ...timestamps(),
  },
  (table) => [
    index('evaluation_results_v2_workspace_id_idx').on(table.workspaceId),
    index('evaluation_results_v2_commit_id_idx').on(table.commitId),
    index('evaluation_results_v2_evaluation_uuid_idx').on(table.evaluationUuid),
    index('evaluation_results_v2_experiment_id_idx').on(table.experimentId),
    index('evaluation_results_v2_dataset_id_idx').on(table.datasetId),
    index('evaluation_results_v2_evaluated_row_id_idx').on(
      table.evaluatedRowId,
    ),
    index('evaluation_results_v2_evaluated_log_id_idx').on(
      table.evaluatedLogId,
    ),
    index('evaluation_results_v2_created_at_idx').on(table.createdAt),
    index('evaluation_results_v2_commit_evaluation_idx').on(
      table.commitId,
      table.evaluationUuid,
    ),
    uniqueIndex(
      'evaluation_results_v2_unique_evaluated_log_id_evaluation_uuid_idx',
    ).on(table.evaluatedLogId, table.evaluationUuid),
    index('evaluation_results_v2_issue_id_idx').on(table.issueId),
    index('evaluation_results_v2_created_at_brin_idx')
      .using('brin', sql`${table.createdAt}`)
      .with({ pages_per_range: 32, autosummarize: true })
      .concurrently(),
    index('evaluation_results_v2_evaluated_span_id_idx').on(
      table.evaluatedSpanId,
      table.evaluatedTraceId,
    ),
    uniqueIndex(
      'evaluation_results_v2_unique_evaluated_span_id_evaluation_uuid_idx',
    ).on(table.evaluatedSpanId, table.evaluatedTraceId, table.evaluationUuid),
    index('evaluation_results_v2_type_workspace_idx').on(
      table.evaluationType,
      table.workspaceId,
    ),
  ],
)
