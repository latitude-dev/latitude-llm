import {
  LatitudeErrorCodes,
  LatitudeErrorDetails,
  RunErrorCodes,
  RunErrorDetails,
} from './constants'
import { LatitudeErrorDto, UnprocessableEntityError } from './latitudeError'

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
    const detailsWithCode = details
      ? { ...details, errorCode: code }
      : { errorCode: code }
    super(message, detailsWithCode)

    this.errorCode = code
    this.details = detailsWithCode
    this.stack = stack
  }

  serialize(): LatitudeErrorDto {
    return {
      ...super.serialize(),
      name: this.constructor.name as LatitudeErrorCodes,
      code: this.errorCode as RunErrorCodes,
    }
  }

  static deserialize(json: LatitudeErrorDto): ChainError<RunErrorCodes> {
    return new ChainError({
      code: json.code,
      message: json.message,
      details: json.details as RunErrorDetails<RunErrorCodes>,
    })
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
