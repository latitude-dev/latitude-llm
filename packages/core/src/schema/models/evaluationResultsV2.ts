import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  EvaluationResultError,
  EvaluationResultMetadata,
} from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { datasetRows } from './datasetRows'
import { datasetsV2 } from './datasetsV2'
import { providerLogs } from './providerLogs'
import { workspaces } from './workspaces'
import { experiments } from './experiments'

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
    experimentId: bigint('experiment_id', { mode: 'number' }).references(
      () => experiments.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    datasetId: bigint('dataset_id', { mode: 'number' }).references(
      () => datasetsV2.id,
      { onDelete: 'set null' },
    ),
    evaluatedRowId: bigint('evaluated_row_id', { mode: 'number' }).references(
      () => datasetRows.id,
      { onDelete: 'set null' },
    ),
    evaluatedLogId: bigint('evaluated_log_id', { mode: 'number' })
      .notNull()
      .references(() => providerLogs.id, { onDelete: 'cascade' }),
    score: bigint('score', { mode: 'number' }),
    normalizedScore: bigint('normalized_score', { mode: 'number' }),
    metadata: jsonb('metadata').$type<EvaluationResultMetadata>(),
    hasPassed: boolean('has_passed'),
    error: jsonb('error').$type<EvaluationResultError>(),
    // Denormalized metadata fields - create indexes if necessary
    usedForSuggestion: boolean('used_for_suggestion'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('evaluation_results_v2_workspace_id_idx').on(
      table.workspaceId,
    ),
    commitIdIdx: index('evaluation_results_v2_commit_id_idx').on(
      table.commitId,
    ),
    evaluationUuidIdx: index('evaluation_results_v2_evaluation_uuid_idx').on(
      table.evaluationUuid,
    ),
    experimentIdIdx: index('evaluation_results_v2_experiment_id_idx').on(
      table.experimentId,
    ),
    datasetIdIdx: index('evaluation_results_v2_dataset_id_idx').on(
      table.datasetId,
    ),
    evaluatedRowIdIdx: index('evaluation_results_v2_evaluated_row_id_idx').on(
      table.evaluatedRowId,
    ),
    evaluatedLogIdIdx: index('evaluation_results_v2_evaluated_log_id_idx').on(
      table.evaluatedLogId,
    ),
    createdAtIdx: index('evaluation_results_v2_created_at_idx').on(
      table.createdAt,
    ),
  }),
)
