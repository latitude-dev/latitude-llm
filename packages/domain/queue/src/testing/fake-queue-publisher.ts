import { Effect } from "effect"
import type { PublishOptions, QueueName, QueuePublisherShape, TaskName, TaskPayload } from "../index.ts"

export interface PublishedMessage {
  readonly queue: QueueName
  readonly task: string
  readonly payload: unknown
  readonly options?: PublishOptions
}

export interface FakeQueuePublisherHandle {
  readonly publisher: QueuePublisherShape
  /** Every publish call in order, including duplicates — use this for call-count assertions. */
  readonly published: PublishedMessage[]
  /**
   * Latest published message per `(queue, dedupeKey)` — mirrors BullMQ's
   * dedupe-by-jobId behavior where repeated publishes under the same
   * dedupeKey collapse to one delayed job and the latest payload wins.
   */
  getPublishedByDedupeKey(queue: QueueName, dedupeKey: string): PublishedMessage | undefined
  /**
   * Snapshot of all deduped messages that would be "pending" in BullMQ
   * (those published with `dedupeKey`). Returns an array.
   */
  listDeduped(): PublishedMessage[]
}

const dedupeMapKey = (queue: QueueName, dedupeKey: string) => `${queue}::${dedupeKey}`

export const createFakeQueuePublisher = (overrides?: Partial<QueuePublisherShape>): FakeQueuePublisherHandle => {
  const published: PublishedMessage[] = []
  const deduped = new Map<string, PublishedMessage>()

  const publisher: QueuePublisherShape = {
    publish: <T extends QueueName, K extends TaskName<T>>(
      queue: T,
      task: K,
      payload: TaskPayload<T, K>,
      options?: PublishOptions,
    ) => {
      const message: PublishedMessage =
        options === undefined ? { queue, task, payload } : { queue, task, payload, options }
      published.push(message)
      if (options?.dedupeKey) {
        deduped.set(dedupeMapKey(queue, options.dedupeKey), message)
      }
      return Effect.void
    },
    close: () => Effect.void,
    ...overrides,
  }

  return {
    publisher,
    published,
    getPublishedByDedupeKey: (queue, dedupeKey) => deduped.get(dedupeMapKey(queue, dedupeKey)),
    listDeduped: () => Array.from(deduped.values()),
  }
}
