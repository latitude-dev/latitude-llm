import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core'
import { EvaluationResultMetadata } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { commits } from './commits'
import { providerLogs } from './providerLogs'
import { workspaces } from './workspaces'

export const evaluationResultsV2 = latitudeSchema.table(
  'evaluation_results_v2',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commitId: bigint('commit_id', { mode: 'number' })
      .notNull()
      .references(() => commits.id, { onDelete: 'restrict' }),
    evaluationUuid: uuid('evaluation_uuid').notNull(),
    experimentId: bigint('experiment_id', { mode: 'number' }),
    // .references(() => experiments.id, { onDelete: 'restrict' }), // TODO: Add this when experiment table is created
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
    commitIdIdx: index('evaluation_results_v2_commit_id_idx').on(
      table.commitId,
    ),
    evaluationUuidIdx: index('evaluation_results_v2_evaluation_uuid_idx').on(
      table.evaluationUuid,
    ),
    experimentIdIdx: index('evaluation_results_v2_experiment_id_idx').on(
      table.experimentId,
    ),
    evaluatedLogIdIdx: index('evaluation_results_v2_evaluated_log_id_idx').on(
      table.evaluatedLogId,
    ),
  }),
)
