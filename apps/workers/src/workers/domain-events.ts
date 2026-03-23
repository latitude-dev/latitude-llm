import type { EventEnvelope } from "@domain/events"
import type { QueueConsumer, QueueName, QueuePublisherShape } from "@domain/queue"
import { createEventHandler, mapEnvelopeToQueueMessage } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("domain-events")

/**
 * Maps event names to the queues that should process them.
 * Each queue has its own dedicated worker.
 * To handle a new event, add an entry here and create a worker for the queue.
 */
const eventHandlers: Record<string, QueueName[]> = {
  MagicLinkEmailRequested: ["magic-link-email"],
}

const dispatch = (event: EventEnvelope, queuePublisher: QueuePublisherShape): Effect.Effect<void, unknown> => {
  const queues = eventHandlers[event.event.name]

  if (!queues || queues.length === 0) {
    return Effect.sync(() => logger.info(`No handlers for event ${event.event.name} (id=${event.id}), skipping`))
  }

  const message = mapEnvelopeToQueueMessage(event)

  return Effect.all(
    queues.map((queue) =>
      queuePublisher
        .publish(queue, message)
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => logger.info(`Dispatched ${event.event.name} (id=${event.id}) to ${queue}`)),
          ),
        ),
    ),
    { concurrency: "unbounded" },
  ).pipe(Effect.asVoid)
}

export const createDomainEventsWorker = (consumer: QueueConsumer, queuePublisher: QueuePublisherShape) => {
  consumer.subscribe("domain-events", createEventHandler({ handle: (event) => dispatch(event, queuePublisher) }))
}
