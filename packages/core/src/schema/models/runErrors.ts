import { RunErrorCodes } from '@latitude-data/constants/errors'
import { bigserial, index, jsonb, text, uuid } from 'drizzle-orm/pg-core'

import { ErrorableEntity } from '../../constants'
import { LatitudeErrorDetails } from '../../lib/errors'
import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'

export const errorCodeEnum = latitudeSchema.enum('run_error_code_enum', [
  RunErrorCodes.Unknown,
  RunErrorCodes.DefaultProviderExceededQuota,
  RunErrorCodes.DocumentConfigError,
  RunErrorCodes.MissingProvider,
  RunErrorCodes.ChainCompileError,
  RunErrorCodes.AIRunError,
  RunErrorCodes.RateLimit,
  RunErrorCodes.UnsupportedProviderResponseTypeError,
  RunErrorCodes.AIProviderConfigError,
  // DEPRECATED, not do not delete them
  RunErrorCodes.EvaluationRunMissingProviderLogError, // TODO(evalsv2): Deprecated, remove when v1 evals are migrated
  RunErrorCodes.EvaluationRunMissingWorkspaceError, // TODO(evalsv2): Deprecated, remove when v1 evals are migrated
  RunErrorCodes.EvaluationRunUnsupportedResultTypeError, // TODO(evalsv2): Deprecated, remove when v1 evals are migrated
  RunErrorCodes.EvaluationRunResponseJsonFormatError, // TODO(evalsv2): Deprecated, remove when v1 evals are migrated
  RunErrorCodes.DefaultProviderInvalidModel,
  RunErrorCodes.MaxStepCountExceededError,
  RunErrorCodes.FailedToWakeUpIntegrationError,
  RunErrorCodes.InvalidResponseFormatError,
  RunErrorCodes.ErrorGeneratingMockToolResult,
  RunErrorCodes.PaymentRequiredError,
  RunErrorCodes.AbortError,
])

export const runErrorEntities = latitudeSchema.enum('run_error_entity_enum', [
  ErrorableEntity.DocumentLog,
  ErrorableEntity.EvaluationResult,
])

export type RunErrorDetails<C extends RunErrorCodes> =
  C extends RunErrorCodes.ChainCompileError
    ? { compileCode: string; message: string }
    : never

export const runErrors = latitudeSchema.table(
  'run_errors',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    code: errorCodeEnum('code').notNull(),
    errorableType: runErrorEntities('errorable_type').notNull(),
    errorableUuid: uuid('errorable_uuid').notNull(),
    message: text('message').notNull(),
    details: jsonb('details').$type<
      RunErrorDetails<RunErrorCodes> | LatitudeErrorDetails
    >(),
    ...timestamps(),
  },
  (table) => ({
    errorableEntityUuidx: index('run_errors_errorable_entity_uuid_idx').on(
      table.errorableUuid,
      table.errorableType,
    ),
  }),
)
