import { bigint, bigserial, boolean, index, jsonb } from 'drizzle-orm/pg-core'
import { EvaluationResultMetadata } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { evaluationsV2 } from './evaluationsV2'
import { providerLogs } from './providerLogs'
import { workspaces } from './workspaces'

export const evaluationResultsV2 = latitudeSchema.table(
  'evaluation_results_v2',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .notNull()
      .references(() => evaluationsV2.id, { onDelete: 'cascade' }),
    experimentId: bigint('experiment_id', { mode: 'number' }),
    // .references(() => experiments.id, { onDelete: 'set null' }), // TODO: Add this when experiment table is created
    evaluatedLogId: bigint('evaluated_log_id', { mode: 'number' })
      .notNull()
      .references(() => providerLogs.id, { onDelete: 'cascade' }),
    score: bigint('score', { mode: 'number' }).notNull(),
    metadata: jsonb('metadata').notNull().$type<EvaluationResultMetadata>(),
    // Denormalized metadata fields - create indexes if necessary
    usedForSuggestion: boolean('used_for_suggestion'),
    ...timestamps(),
  },
  (table) => ({
    workspaceIdIdx: index('evaluation_results_v2_workspace_id_idx').on(
      table.workspaceId,
    ),
    evaluationIdIdx: index('evaluation_results_v2_evaluation_id_idx').on(
      table.evaluationId,
    ),
    experimentIdIdx: index('evaluation_results_v2_experiment_id_idx').on(
      table.experimentId,
    ),
    evaluatedLogIdIdx: index('evaluation_results_v2_evaluated_log_id_idx').on(
      table.evaluatedLogId,
    ),
  }),
)
