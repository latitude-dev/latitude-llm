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

export class QueueItemNotFoundError extends Data.TaggedError("QueueItemNotFoundError")<{
  readonly itemId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Queue item not found"
}

export class QueueItemAlreadyCompletedError extends Data.TaggedError("QueueItemAlreadyCompletedError")<{
  readonly itemId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Queue item is already completed"
}

export class QueueItemNotCompletedError extends Data.TaggedError("QueueItemNotCompletedError")<{
  readonly itemId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Queue item is not completed"
}
