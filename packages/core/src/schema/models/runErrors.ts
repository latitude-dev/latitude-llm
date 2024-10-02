import { bigint, bigserial, index, jsonb, text } from 'drizzle-orm/pg-core'

import { ErrorableEntity, RunErrorCodes } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { providerLogs } from './providerLogs'

export const errorCodeEnum = latitudeSchema.enum('run_error_code_enum', [
  RunErrorCodes.Unknown,
  RunErrorCodes.DefaultProviderExceededQuota,
  RunErrorCodes.DocumentConfigError,
  RunErrorCodes.MissingProvider,
  RunErrorCodes.ChainCompileError,
  RunErrorCodes.AIRunError,
])

export const runErrorEntities = latitudeSchema.enum('run_error_entity_enum', [
  ErrorableEntity.DocumentLog,
  ErrorableEntity.EvaluationResult,
])

export const runErrors = latitudeSchema.table(
  'run_errors',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    code: errorCodeEnum('code').notNull(),
    errorableType: runErrorEntities('errorable_type'),
    errorableId: bigint('errorable_id', { mode: 'number' }),
    providerLogId: bigint('provider_log_id', { mode: 'number' }).references(
      () => providerLogs.id,
      {
        onDelete: 'set null',
        onUpdate: 'cascade',
      },
    ),
    message: text('message').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (table) => ({
    providerIdx: index('run_errors_provider_log_idx').on(table.providerLogId),
    errorableEntityIdx: index('run_errors_errorable_entity_idx').on(
      table.errorableId,
      table.errorableType,
    ),
  }),
)
