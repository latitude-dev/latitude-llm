import { Data } from "effect"

export class SpanDecodingError extends Data.TaggedError("SpanDecodingError")<{
  readonly reason: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.reason
  }
}
