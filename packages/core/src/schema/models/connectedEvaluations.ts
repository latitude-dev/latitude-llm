import { bigint, bigserial, index, unique, uuid } from 'drizzle-orm/pg-core'

import { EvaluationMode } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { evaluations } from './evaluations'

const evaluationModeEnum = latitudeSchema.enum('evaluation_mode_enum', [
  EvaluationMode.Live,
  EvaluationMode.Batch,
])

export const connectedEvaluations = latitudeSchema.table(
  'connected_evaluations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    commitUuid: uuid('commit_uuid').notNull(),
    documentUuid: uuid('document_uuid').notNull(),
    evaluationMode: evaluationModeEnum('evaluation_mode').notNull(),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .notNull()
      .references(() => evaluations.id),
    ...timestamps(),
  },
  (table) => ({
    connectedEvaluationEvaluationIdx: index(
      'connected_evaluations_evaluation_idx',
    ).on(table.evaluationId),
    connectedEvaluationsUniqueIdx: unique(
      'connected_evaluations_unique_idx',
    ).on(table.documentUuid, table.commitUuid, table.evaluationId),
  }),
)
