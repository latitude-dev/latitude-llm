import type { EventsPublisher } from "@domain/events"
import { Data, ServiceMap } from "effect"

export class KafkaClientError extends Data.TaggedError("KafkaClientError")<{
  readonly cause: unknown
}> {}

export interface KafkaConfig {
  readonly clientId: string
  readonly brokers: string[]
  readonly groupId: string
  readonly ssl: boolean | undefined
  readonly sasl: { readonly mechanism: "plain"; readonly username: string; readonly password: string } | undefined
}

/**
 * Service tag for Redpanda queue adapter
 * Enables dependency injection and adapter switching
 */
export class RedpandaQueueAdapterTag extends ServiceMap.Service<
  RedpandaQueueAdapterTag,
  {
    readonly type: "redpanda"
    readonly publisher: EventsPublisher
  }
>()("@platform/queue-redpanda/RedpandaQueueAdapterTag") {}

/**
 * Adapter type constant for Redpanda
 */
export const redpandaQueueAdapter = {
  type: "redpanda" as const,
}
