import { Effect } from "effect"
import type { PublishOptions, QueueName, QueuePublisherShape, TaskName, TaskPayload } from "../index.ts"

export interface PublishedMessage {
  readonly queue: QueueName
  readonly task: string
  readonly payload: unknown
  readonly options?: PublishOptions
}

export const createFakeQueuePublisher = (overrides?: Partial<QueuePublisherShape>) => {
  const published: PublishedMessage[] = []

  const publisher: QueuePublisherShape = {
    publish: <T extends QueueName, K extends TaskName<T>>(
      queue: T,
      task: K,
      payload: TaskPayload<T, K>,
      options?: PublishOptions,
    ) => {
      published.push(options === undefined ? { queue, task, payload } : { queue, task, payload, options })
      return Effect.void
    },
    close: () => Effect.void,
    ...overrides,
  }

  return { publisher, published }
}
