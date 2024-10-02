import { bigint, bigserial, index, jsonb, text } from 'drizzle-orm/pg-core'

import { ErrorableEntity, RunErrorCodes } from '../../constants'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const errorCodeEnum = latitudeSchema.enum('run_error_code_enum', [
  RunErrorCodes.Unknown,
  RunErrorCodes.DefaultProviderExceededQuota,
  RunErrorCodes.DocumentConfigError,
  RunErrorCodes.MissingProvider,
  RunErrorCodes.ChainCompileError,
  RunErrorCodes.AIRunError,
  RunErrorCodes.UnsupportedProviderResponseTypeError,
  RunErrorCodes.AIProviderConfigError,
])

export const runErrorEntities = latitudeSchema.enum('run_error_entity_enum', [
  ErrorableEntity.DocumentLog,
  ErrorableEntity.EvaluationResult,
])

type RunErrorDetails<C extends RunErrorCodes> =
  C extends RunErrorCodes.ChainCompileError
    ? { compileCode: string; message: string }
    : never

export const runErrors = latitudeSchema.table(
  'run_errors',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    code: errorCodeEnum('code').notNull(),
    errorableType: runErrorEntities('errorable_type').notNull(),
    errorableId: bigint('errorable_id', { mode: 'number' }).notNull(),
    message: text('message').notNull(),
    details: jsonb('details').$type<RunErrorDetails<RunErrorCodes>>(),
    ...timestamps(),
  },
  (table) => ({
    errorableEntityIdx: index('run_errors_errorable_entity_idx').on(
      table.errorableId,
      table.errorableType,
    ),
  }),
)
