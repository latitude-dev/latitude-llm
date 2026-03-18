import { defineError } from "@domain/shared"
import type { Effect } from "effect"

export type QueueName = "dataset-export" | "domain-events" | "span-ingestion"

export interface QueueMessage {
  readonly body: Uint8Array
  readonly headers: ReadonlyMap<string, string>
  readonly key: string | null
}

export interface MessageHandler {
  readonly handle: (message: QueueMessage) => Effect.Effect<void, unknown>
}

export interface QueuePublisher {
  readonly publish: (queue: QueueName, message: QueueMessage) => Effect.Effect<void, QueuePublishError>
  readonly close: () => Effect.Effect<void>
}

export interface QueueConsumer {
  readonly start: () => Effect.Effect<void, QueueSubscribeError>
  readonly stop: () => Effect.Effect<void>
  readonly subscribe: (queue: QueueName, handler: MessageHandler) => void
}

export class QueuePublishError extends defineError("QueuePublishError", 502, "Queue publish failed")<{
  readonly cause: unknown
  readonly queue: QueueName
}> {}

export class QueueSubscribeError extends defineError("QueueSubscribeError", 503, "Queue consumer unavailable")<{
  readonly cause: unknown
}> {}

export class QueueClientError extends defineError("QueueClientError", 503, "Queue client not connectable")<{
  readonly cause: unknown
}> {}
