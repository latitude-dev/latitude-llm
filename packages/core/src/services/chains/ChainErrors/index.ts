import { RunError } from '../../../browser'
import { RunErrorCodes, RunErrorDetails } from '../../../constants'

export class ChainError<T extends RunErrorCodes> extends Error {
  errorCode: T
  details: RunErrorDetails<T> | undefined
  runError?: RunError

  constructor({
    message,
    code,
    details,
  }: {
    message: string
    code: T
    details?: RunErrorDetails<T>
  }) {
    super(message)
    this.errorCode = code
    this.details = details || undefined
  }

  get dbError(): RunError | undefined {
    return this.runError
  }

  set dbError(error: RunError) {
    this.runError = error
  }
}
