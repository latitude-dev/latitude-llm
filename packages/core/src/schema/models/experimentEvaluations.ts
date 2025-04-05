import { bigint, primaryKey } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { experiments } from './experiments'
import { evaluations } from './evaluations'

export const experimentEvaluations = latitudeSchema.table(
  'experiment_evaluations',
  {
    experimentId: bigint('experiment_id', { mode: 'number' })
      .references(() => experiments.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .references(() => evaluations.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
      .notNull(),
  },
  (table) => ({
    experimentEvaluationsPk: primaryKey({
      name: 'experiment_evaluations_pk',
      columns: [table.experimentId, table.evaluationId],
    }),
  }),
)
