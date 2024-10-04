import { RunErrorCodes, RunErrorDetails } from '../../../constants'

export class ChainError<T extends RunErrorCodes> extends Error {
  errorCode: T
  details: RunErrorDetails<T> | undefined

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
}
