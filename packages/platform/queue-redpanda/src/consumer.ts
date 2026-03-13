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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createRedpandaEventsConsumer = (config: RedpandaEventsConsumerConfig) => {
  const consumer = config.kafka.consumer({
    groupId: config.groupId,
  })

  let isRunning = false

  const start = async (handler: EventHandler): Promise<void> => {
    await consumer.connect()
    await consumer.subscribe({
      topic: Topics.domainEvents,
    })

    isRunning = true

    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        if (!isRunning) return

        const value = payload.message.value
        if (!value) {
          await Effect.runPromise(Effect.logError("Received message with null value"))
          return
        }

        let event: EventEnvelope
        try {
          const parsed = JSON.parse(value.toString())
          event = EventEnvelopeSchema.parse(parsed)
        } catch (error) {
          await Effect.runPromise(Effect.logError(`Invalid event envelope: ${error}`))
          return
        }

        // Retry with exponential backoff
        let lastError: unknown
        for (let attempt = 0; attempt < 3; attempt++) {
          if (!isRunning) return

          if (attempt > 0) {
            await sleep(1000 * 2 ** (attempt - 1)) // 1s, 2s
          }

          try {
            await Effect.runPromise(handler.handle(event))
            return // Success, exit retry loop
          } catch (error) {
            lastError = error
            await Effect.runPromise(
              Effect.logError(
                `Error processing event (attempt ${attempt + 1}/3) from ${payload.topic}[${payload.partition}@${payload.message.offset}]: ${error}`,
              ),
            )
            await payload.heartbeat()
          }
        }

        // All retries failed
        await Effect.runPromise(Effect.logError(`Failed to process event after 3 retries: ${lastError}`))
        // TODO: Send to dead-letter topic
      },
    })
  }

  const stop = async (): Promise<void> => {
    isRunning = false
    await consumer.disconnect()
  }

  return {
    start,
    stop,
    pause: () => consumer.pause([{ topic: Topics.domainEvents }]),
    resume: () => consumer.resume([{ topic: Topics.domainEvents }]),
  }
}
