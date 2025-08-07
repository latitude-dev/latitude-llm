import { bigint, bigserial, boolean, index, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { evaluations } from './evaluations'

export const connectedEvaluations = latitudeSchema.table(
  'connected_evaluations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    live: boolean('live').notNull().default(false),
    documentUuid: uuid('document_uuid').notNull(),
    deletedAt: timestamp('deleted_at'),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .notNull()
      .references(() => evaluations.id),
    ...timestamps(),
  },
  (table) => ({
    connectedEvaluationEvaluationIdx: index('connected_evaluations_evaluation_idx').on(
      table.evaluationId,
    ),
    connectedEvaluationsUniqueIdx: unique('connected_evaluations_unique_idx').on(
      table.documentUuid,
      table.evaluationId,
    ),
    documentUuidIdx: index('connected_evaluations_document_uuid_idx').on(table.documentUuid),
  }),
)
