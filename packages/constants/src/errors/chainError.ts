import { UnprocessableEntityError } from './latitudeError'
import type { RunErrorCodes, RunErrorDetails, LatitudeErrorDetails } from './constants'
export class ChainError<
  T extends RunErrorCodes,
  RunError = object,
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
    const detailsWithCode = details ? { ...details, errorCode: code } : { errorCode: code }
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

  get code(): T {
    return this.errorCode
  }
}
