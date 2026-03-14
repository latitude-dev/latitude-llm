import type { EventEnvelope } from "@domain/events"
import { Effect } from "effect"
import type { EachMessagePayload } from "kafkajs"
import { z } from "zod"
import { Topics } from "./topics.ts"

export interface RedpandaEventsConsumerConfig {
  readonly kafka: import("kafkajs").Kafka
  readonly groupId: string
}

export const DomainEventSchema = z.object({
  name: z.string(),
  organizationId: z.string(),
  payload: z.record(z.string(), z.unknown()),
})

export const EventEnvelopeSchema = z
  .object({
    id: z.string(),
    event: DomainEventSchema,
    occurredAt: z
      .string()
      .datetime()
      .transform((s) => new Date(s)),
  })
  .strict()

export interface EventHandler {
  handle(event: EventEnvelope): Effect.Effect<void, unknown, never>
}

export const createRedpandaEventsConsumer = (config: RedpandaEventsConsumerConfig) => {
  const consumer = config.kafka.consumer({
    groupId: config.groupId,
  })

  let isRunning = false
  let runPromise: Promise<void> | undefined

  const start = async (handler: EventHandler): Promise<void> => {
    await consumer.connect()
    await consumer.subscribe({
      topic: Topics.domainEvents,
    })

    isRunning = true

    runPromise = consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        if (!isRunning) return

        const value = payload.message.value
        if (!value) return

        let event: EventEnvelope
        try {
          const parsed = JSON.parse(value.toString())
          event = EventEnvelopeSchema.parse(parsed)
        } catch {
          // Poison pill — skip permanently undeserializable messages
          return
        }

        // Let processing errors propagate so kafkajs retries via offset management
        await Effect.runPromise(handler.handle(event))
      },
    })

    runPromise.catch((error) => {
      void Effect.runPromise(Effect.logError(`Redpanda consumer crashed: ${error}`))
    })
  }

  const stop = async (): Promise<void> => {
    isRunning = false
    await consumer.disconnect()
    await runPromise
  }

  return {
    start,
    stop,
    pause: () => consumer.pause([{ topic: Topics.domainEvents }]),
    resume: () => consumer.resume([{ topic: Topics.domainEvents }]),
  }
}
