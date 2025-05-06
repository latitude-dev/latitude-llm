import { RunErrorCodes, RunErrorDetails } from '@latitude-data/constants/errors'

import { ErrorableEntity, RunError } from '../../../browser'
import { LatitudeErrorDetails, UnprocessableEntityError } from '../../errors'
import { createRunError } from '../../../services/runErrors/create'
import { isErrorRetryable } from '../../../services/evaluationsV2/run'

export class ChainError<
  T extends RunErrorCodes,
> extends UnprocessableEntityError {
  errorCode: T
  details: LatitudeErrorDetails
  runError?: RunError

  constructor({
    message,
    code,
    details,
    stack,
  }: {
    message: string
    code: T
    details?: RunErrorDetails<T>
    stack?: string
  }) {
    const detailsWithCode = details
      ? { ...details, errorCode: code }
      : { errorCode: code }
    super(message, detailsWithCode)

    this.errorCode = code
    this.details = detailsWithCode
    this.stack = stack
  }

  get dbError(): RunError | undefined {
    return this.runError
  }

  set dbError(error: RunError) {
    this.runError = error
  }
}

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

  let chainError: ChainError<RunErrorCodes> = error as ChainError<RunErrorCodes>
  if (!(error instanceof ChainError)) {
    chainError = new ChainError<RunErrorCodes.Unknown>({
      ...error,
      message: error.message,
      stack: error.stack,
      code: RunErrorCodes.Unknown,
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
