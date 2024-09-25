import { bigint, bigserial, index, pgEnum } from 'drizzle-orm/pg-core'

import { EvaluationResultableType } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { documentLogs } from '../models/documentLogs'
import { logSourcesEnum, providerLogs } from '../models/providerLogs'
import { timestamps } from '../schemaHelpers'
import { evaluations } from './evaluations'

export const evaluationResultTypes = pgEnum('evaluation_result_types', [
  EvaluationResultableType.Boolean,
  EvaluationResultableType.Text,
  EvaluationResultableType.Number,
])

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
    resultableType: evaluationResultTypes('resultable_type').notNull(),
    resultableId: bigint('resultable_id', { mode: 'number' }).notNull(),
    source: logSourcesEnum('source'),
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
    evaluationResultMetadataIdx: index('resultable_idx').on(
      table.resultableId,
      table.resultableType,
    ),
  }),
)
