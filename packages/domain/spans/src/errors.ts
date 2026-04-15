import { Data } from "effect"

export class SpanDecodingError extends Data.TaggedError("SpanDecodingError")<{
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}

export class TraceCohortUnavailableError extends Data.TaggedError("TraceCohortUnavailableError")<{
  readonly cohort: string
  readonly reason: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return this.reason
  }
}
