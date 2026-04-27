import { Data } from "effect"
import type { TopicRegistry } from "./topic-registry.ts"

type QueueName = keyof TopicRegistry & string

const toCauseMessage = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message || String(cause)
  if (typeof cause === "string") return cause
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") {
    return cause.message
  }
  return String(cause)
}

export class QueuePublishError extends Data.TaggedError("QueuePublishError")<{
  readonly cause: unknown
  readonly queue: QueueName
}> {
  readonly httpStatus = 502
  get httpMessage() {
    return `Failed to publish message to queue "${this.queue}"`
  }

  constructor(args: { readonly cause: unknown; readonly queue: QueueName }) {
    super(args)
    this.message = `Failed to publish message to queue "${args.queue}": ${toCauseMessage(args.cause)}`
  }
}

export class QueueSubscribeError extends Data.TaggedError("QueueSubscribeError")<{
  readonly cause: unknown
}> {
  readonly httpStatus = 503
  readonly httpMessage = "Queue consumer unavailable"

  constructor(args: { readonly cause: unknown }) {
    super(args)
    this.message = `Queue consumer unavailable: ${toCauseMessage(args.cause)}`
  }
}

export class QueueClientError extends Data.TaggedError("QueueClientError")<{
  readonly cause: unknown
}> {
  readonly httpStatus = 503
  readonly httpMessage = "Queue client not connectable"

  constructor(args: { readonly cause: unknown }) {
    super(args)
    this.message = `Queue client not connectable: ${toCauseMessage(args.cause)}`
  }
}
