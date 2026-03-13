import type { EventEnvelope, EventsPublisher } from "@domain/events"
import { Data, Effect } from "effect"
import type { Kafka } from "kafkajs"
import { Topics } from "./topics.ts"
import { KafkaClientError } from "./types.ts"

export class RedpandaProducerError extends Data.TaggedError("RedpandaProducerError")<{
  readonly cause: unknown
  readonly envelope?: EventEnvelope
}> {}

export interface RedpandaEventsPublisherConfig {
  readonly kafka: Kafka
}

export const mapEnvelopeToMessage = (envelope: EventEnvelope) => {
  return {
    key: envelope.event.organizationId,
    value: JSON.stringify({
      id: envelope.id,
      event: {
        name: envelope.event.name,
        organizationId: envelope.event.organizationId,
        payload: envelope.event.payload,
      },
      occurredAt: envelope.occurredAt.toISOString(),
    }),
    headers: {
      "event-id": envelope.id,
      "event-name": envelope.event.name,
      "organization-id": envelope.event.organizationId,
    },
    timestamp: envelope.occurredAt.getTime().toString(),
  }
}

export const createRedpandaEventsPublisherEffect = (
  config: RedpandaEventsPublisherConfig,
): Effect.Effect<EventsPublisher, RedpandaProducerError | KafkaClientError> =>
  Effect.gen(function* () {
    const producer = yield* Effect.try({
      try: () =>
        config.kafka.producer({
          allowAutoTopicCreation: false,
          retry: {
            initialRetryTime: 100,
            maxRetryTime: 30000,
          },
        }),
      catch: (error: unknown) => new KafkaClientError({ cause: error }),
    })

    yield* Effect.tryPromise({
      try: () => producer.connect(),
      catch: (error: unknown) => new RedpandaProducerError({ cause: error }),
    })

    const publishEffect = (envelope: EventEnvelope): Effect.Effect<void, RedpandaProducerError> =>
      Effect.gen(function* () {
        const message = mapEnvelopeToMessage(envelope)

        yield* Effect.tryPromise({
          try: () =>
            producer.send({
              topic: Topics.domainEvents,
              acks: -1,
              messages: [message],
            }),
          catch: (error: unknown) => new RedpandaProducerError({ cause: error, envelope }),
        })
      })

    return {
      publish: (envelope: EventEnvelope) => Effect.runPromise(publishEffect(envelope)),
    } satisfies EventsPublisher
  })

export const createRedpandaEventsPublisher = async (
  config: RedpandaEventsPublisherConfig,
): Promise<EventsPublisher> => {
  return Effect.runPromise(createRedpandaEventsPublisherEffect(config))
}
