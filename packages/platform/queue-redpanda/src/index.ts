import { Effect, Layer } from "effect"
import { type RedpandaEventsPublisherConfig, createRedpandaEventsPublisherEffect } from "./producer.ts"
import { RedpandaQueueAdapterTag } from "./types.ts"

export { createKafkaClient, createKafkaClientEffect } from "./client.ts"

export {
  createRedpandaEventsPublisher,
  createRedpandaEventsPublisherEffect,
  RedpandaProducerError,
} from "./producer.ts"

export { loadKafkaConfig } from "./config.ts"

export { KafkaClientError, RedpandaQueueAdapterTag, redpandaQueueAdapter } from "./types.ts"

export type { KafkaConfig } from "./types.ts"

export { createRedpandaEventsConsumer, DomainEventSchema, EventEnvelopeSchema } from "./consumer.ts"

export type { RedpandaEventsConsumerConfig, EventHandler } from "./consumer.ts"

/**
 * Live layer for Redpanda events publisher
 * Enables dependency injection via Effect Layer
 */
export const RedpandaEventsPublisherLive = (config: RedpandaEventsPublisherConfig) =>
  Layer.effect(
    RedpandaQueueAdapterTag,
    createRedpandaEventsPublisherEffect(config).pipe(
      Effect.map((publisher) => ({
        type: "redpanda" as const,
        publisher,
      })),
    ),
  )
