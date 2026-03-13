import { Effect, Layer } from "effect"
import { createRedpandaEventsPublisherEffect, type RedpandaEventsPublisherConfig } from "./producer.ts"
import { RedpandaQueueAdapterTag } from "./types.ts"

export { createKafkaClient, createKafkaClientEffect } from "./client.ts"
export { loadKafkaConfig } from "./config.ts"
export type { EventHandler, RedpandaEventsConsumerConfig } from "./consumer.ts"
export { createRedpandaEventsConsumer, DomainEventSchema, EventEnvelopeSchema } from "./consumer.ts"
export {
  createRedpandaEventsPublisher,
  createRedpandaEventsPublisherEffect,
  RedpandaProducerError,
} from "./producer.ts"
export type { TopicName } from "./topics.ts"
export { Topics } from "./topics.ts"
export type { KafkaConfig } from "./types.ts"
export { KafkaClientError, RedpandaQueueAdapterTag, redpandaQueueAdapter } from "./types.ts"

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
