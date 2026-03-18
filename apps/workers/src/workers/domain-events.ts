import type { EventEnvelope } from "@domain/events"
import type { QueueConsumer } from "@domain/queue"
import { createEventHandler } from "@platform/queue-redpanda"
import { Effect } from "effect"

const eventHandler = {
  handle: (event: EventEnvelope): Effect.Effect<void, unknown> =>
    Effect.logInfo(`Processing event ${event.id} of type ${event.event.name} for org ${event.event.organizationId}`),
}

export const createDomainEventsWorker = (consumer: QueueConsumer) => {
  consumer.subscribe("domain-events", createEventHandler(eventHandler))

  return {
    start: () => Effect.runPromise(consumer.start()),
    stop: () => Effect.runPromise(consumer.stop()),
  }
}
