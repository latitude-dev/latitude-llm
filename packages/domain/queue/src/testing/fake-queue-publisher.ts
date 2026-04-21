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
   * Pending (coalesced) message per `(queue, dedupeKey)` — mirrors BullMQ's
   * dedupe-by-jobId behavior where repeated publishes under the same
   * `dedupeKey` collapse to one delayed job. The resolved payload depends
   * on which coalescing semantic the caller used:
   *
   * - `debounceMs` (sliding window, `extend: true, replace: true` in BullMQ)
   *   → the **latest** payload wins.
   * - `rateLimitMs` (first-publish-wins, `extend: false, replace: false` in
   *   BullMQ) → the **first** payload wins and later publishes are dropped.
   *
   * Plain `dedupeKey` with no window defaults to debounce-style overwrite
   * so existing tests keep their prior semantics.
   */
  getPublishedByDedupeKey(queue: QueueName, dedupeKey: string): PublishedMessage | undefined
  /**
   * Snapshot of all pending deduped messages that would be queued in BullMQ
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
        const key = dedupeMapKey(queue, options.dedupeKey)
        // Rate-limit semantics: first publish wins. Mirrors BullMQ's
        // `extend: false, replace: false` — subsequent publishes within the
        // window are dropped and the pending payload is not touched.
        // Debounce semantics (and plain `dedupeKey` with no window) fall
        // through to the overwrite path — `extend: true, replace: true`.
        if (options.rateLimitMs !== undefined) {
          if (!deduped.has(key)) {
            deduped.set(key, message)
          }
        } else {
          deduped.set(key, message)
        }
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
