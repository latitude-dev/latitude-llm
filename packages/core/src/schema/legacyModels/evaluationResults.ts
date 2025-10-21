import { bigint, bigserial, index, text, uuid } from 'drizzle-orm/pg-core'

import { LogSources } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { documentLogs } from '../models/documentLogs'
import { logSourcesEnum, providerLogs } from '../models/providerLogs'
import { timestamps } from '../schemaHelpers'
import { evaluations } from './evaluations'

// NOTE: Deprecated but do not delete
export const evaluationResults = latitudeSchema.table(
  'evaluation_results',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    uuid: uuid('uuid').unique().notNull(),
    evaluationId: bigint('evaluation_id', { mode: 'number' })
      .notNull()
      .references(() => evaluations.id, { onDelete: 'cascade' }),
    // TODO: remove
    documentLogId: bigint('document_log_id', { mode: 'number' })
      .notNull()
      .references(() => documentLogs.id),
    // TODO: remove
    providerLogId: bigint('provider_log_id', { mode: 'number' }).references(
      () => providerLogs.id,
    ),
    evaluatedProviderLogId: bigint('evaluated_provider_log_id', {
      mode: 'number',
    }).references(() => providerLogs.id),
    evaluationProviderLogId: bigint('evaluation_provider_log_id', {
      mode: 'number',
    }).references(() => providerLogs.id),
    resultableType: text('resultable_type'),
    resultableId: bigint('resultable_id', { mode: 'number' }),
    source: logSourcesEnum('source').$type<LogSources>(),
    reason: text('reason'),
    ...timestamps(),
  },
  (table) => ({
    evaluationIdx: index('evaluation_idx').on(table.evaluationId),
    evaluationProviderLogIdx: index('evaluation_provider_log_idx').on(
      table.evaluationProviderLogId,
    ),
    evaluatedProviderLogIdx: index('evaluated_provider_log_idx').on(
      table.evaluatedProviderLogId,
    ),
    // TODO: remove
    evaluationResultDocumentLogIdx: index('document_log_idx').on(
      table.documentLogId,
    ),
    // TODO: remove
    evaluationResultProviderLogIdx: index('provider_log_idx').on(
      table.providerLogId,
    ),
    evaluationResultMetadataIdx: index('resultable_idx').on(
      table.resultableId,
      table.resultableType,
    ),
    createdAtIdx: index('evaluation_results_created_at_idx').on(
      table.createdAt,
    ),
  }),
)
