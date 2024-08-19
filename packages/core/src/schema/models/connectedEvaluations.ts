import { relations } from 'drizzle-orm'
import { bigint, bigserial, index, unique, uuid } from 'drizzle-orm/pg-core'

import { documentVersions, latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'
import { evaluations } from './evaluations'

export const connectedEvaluations = latitudeSchema.table(
  'connected_evaluations',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    documentUuid: uuid('document_uuid').notNull(),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .notNull()
      .references(() => evaluations.id),
    ...timestamps(),
  },
  (table) => ({
    connectedDocumentIdx: index('connected_document_idx').on(
      table.documentUuid,
    ),
    connectedEvaluationIdx: index('connected_evaluation_idx').on(
      table.evaluationId,
    ),
    connectedEvaluationsUnique: unique('connected_evaluations_unique').on(
      table.documentUuid,
      table.evaluationId,
    ),
  }),
)

export const connectedEvaluationRelations = relations(
  connectedEvaluations,
  ({ one }) => ({
    document: one(documentVersions, {
      fields: [connectedEvaluations.documentUuid],
      references: [documentVersions.documentUuid],
    }),
    evaluation: one(evaluations, {
      fields: [connectedEvaluations.evaluationId],
      references: [evaluations.id],
    }),
  }),
)
