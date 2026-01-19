import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'

import { ErrorableEntity } from '../../../constants'
import { isRetryableError } from '../../../lib/isRetryableError'
import { type RunError } from '../../../schema/models/types/RunError'
import { createRunError } from '../../../services/runErrors/create'

export async function createChainRunError({
  error,
  errorableUuid,
  errorableType,
}: {
  errorableUuid: string
  error: ChainError<RunErrorCodes> | Error
  errorableType?: ErrorableEntity
}) {
  if (!errorableType) return error

  let chainError: ChainError<RunErrorCodes, RunError> = error as ChainError<
    RunErrorCodes,
    RunError
  >
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
  if (!isRetryableError(chainError)) {
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
