import { Data, type Effect, ServiceMap } from "effect"

export type QueueName = "dataset-export" | "domain-events" | "magic-link-email" | "span-ingestion"

export interface QueueMessage {
  readonly body: Uint8Array
  readonly headers: ReadonlyMap<string, string>
  readonly key: string | null
}

export interface MessageHandler {
  readonly handle: (message: QueueMessage) => Effect.Effect<void, unknown>
}

export interface QueuePublisherShape {
  readonly publish: (queue: QueueName, message: QueueMessage) => Effect.Effect<void, QueuePublishError>
  readonly close: () => Effect.Effect<void>
}

export class QueuePublisher extends ServiceMap.Service<QueuePublisher, QueuePublisherShape>()(
  "@domain/queue/QueuePublisher",
) {}

export interface QueueConsumer {
  readonly start: () => Effect.Effect<void, QueueSubscribeError>
  readonly stop: () => Effect.Effect<void>
  readonly subscribe: (queue: QueueName, handler: MessageHandler) => void
}

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
