import { Effect } from "effect"
import type { QueueMessage, QueueName, QueuePublisherShape } from "../index.ts"

export interface PublishedMessage {
  readonly queue: QueueName
  readonly message: { readonly body: Uint8Array; readonly key: string | null }
}

export const createFakeQueuePublisher = (overrides?: Partial<QueuePublisherShape>) => {
  const published: PublishedMessage[] = []

  const publisher: QueuePublisherShape = {
    publish: (queue: QueueName, message: QueueMessage) => {
      published.push({ queue, message: { body: message.body, key: message.key } })
      return Effect.void
    },
    close: () => Effect.void,
    ...overrides,
  }

  return { publisher, published }
}
