import { RunError } from '../../../browser'
import { RunErrorCodes, RunErrorDetails } from '../../../constants'
import { LatitudeErrorDetails, UnprocessableEntityError } from '../../../lib'

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
