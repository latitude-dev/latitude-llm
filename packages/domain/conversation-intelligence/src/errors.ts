import { Data } from "effect"

export class MomentClassifierError extends Data.TaggedError("MomentClassifierError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 502
  get httpMessage() {
    return this.message
  }
}
