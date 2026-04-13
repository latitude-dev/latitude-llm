import { Data } from "effect"

export class TooManyTracesSelectedError extends Data.TaggedError("TooManyTracesSelectedError")<{
  readonly count: number
  readonly limit: number
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return `Selection contains ${this.count} traces, but the limit is ${this.limit}`
  }
}
