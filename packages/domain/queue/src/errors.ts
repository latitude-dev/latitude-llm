import { Data } from "effect"
import type { TopicRegistry } from "./topic-registry.ts"

type QueueName = keyof TopicRegistry & string

export class QueuePublishError extends Data.TaggedError("QueuePublishError")<{
  readonly cause: unknown
  readonly queue: QueueName
}> {
  readonly httpStatus = 502
  get httpMessage() {
    return `Failed to publish message to queue "${this.queue}"`
  }
}

export class QueueSubscribeError extends Data.TaggedError("QueueSubscribeError")<{
  readonly cause: unknown
}> {
  readonly httpStatus = 503
  readonly httpMessage = "Queue consumer unavailable"
}

export class QueueClientError extends Data.TaggedError("QueueClientError")<{
  readonly cause: unknown
}> {
  readonly httpStatus = 503
  readonly httpMessage = "Queue client not connectable"
}
