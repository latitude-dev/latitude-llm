import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

import type { ErrorableEntity, RunError } from '../../../../browser'
import { createRunError } from '../../../../services/runErrors/create'
import { isErrorRetryable } from '../../../../services/evaluationsV2/run'

export async function createChainRunError({
  error,
  errorableUuid,
  errorableType,
  persistErrors,
}: {
  errorableUuid: string
  error: ChainError<RunErrorCodes> | Error
  persistErrors: boolean
  errorableType?: ErrorableEntity
}) {
  if (!persistErrors || !errorableType) return error

  let chainError: ChainError<RunErrorCodes, RunError> = error as ChainError<RunErrorCodes, RunError>
  if (!(error instanceof ChainError)) {
    chainError = new ChainError<RunErrorCodes.Unknown, RunError>({
      ...error,
      message: error.message,
      stack: error.stack,
      code: RunErrorCodes.Unknown,
      details: {
        stack: error.stack || '',
      },
    })
  }

  let dbError
  if (!isErrorRetryable(chainError)) {
    dbError = await createRunError({
      data: {
        errorableUuid,
        errorableType,
        code: chainError.errorCode,
        message: chainError.message,
        details: chainError.details,
      },
    }).then((r) => r.unwrap())

    chainError.dbError = dbError
  }

  return chainError
}
