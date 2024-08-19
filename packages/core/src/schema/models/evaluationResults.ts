import { relations } from 'drizzle-orm'
import { bigint, bigserial, index, text } from 'drizzle-orm/pg-core'

import { documentLogs, latitudeSchema, providerLogs } from '..'
import { timestamps } from '../schemaHelpers'
import { evaluations } from './evaluations'

export const evaluationResults = latitudeSchema.table(
  'evaluation_results',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }),
    documentLogId: bigint('document_log_id', { mode: 'number' })
      .notNull()
      .references(() => documentLogs.id),
    providerLogId: bigint('provider_log_id', { mode: 'number' })
      .notNull()
      .references(() => providerLogs.id),
    result: text('result').notNull(),
    ...timestamps(),
  },
  (table) => ({
    evaluationIdx: index('evaluation_idx').on(table.evaluationId),
    evaluationResultDocumentLogIdx: index('document_log_idx').on(
      table.documentLogId,
    ),
    evaluationResultProviderLogIdx: index('provider_log_idx').on(
      table.providerLogId,
    ),
  }),
)

export const evaluationResultRelations = relations(
  evaluationResults,
  ({ one }) => ({
    evaluation: one(evaluations, {
      fields: [evaluationResults.evaluationId],
      references: [evaluations.id],
    }),
    documentLog: one(documentLogs, {
      fields: [evaluationResults.documentLogId],
      references: [documentLogs.id],
    }),
    providerLog: one(providerLogs, {
      fields: [evaluationResults.providerLogId],
      references: [providerLogs.id],
    }),
  }),
)
