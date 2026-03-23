import type { EventEnvelope } from "@domain/events"
import type { QueueConsumer } from "@domain/queue"
import { createEventHandler } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"
import { handleMagicLinkEmailRequested } from "./domain-events/magic-link-email.ts"

const logger = createLogger("domain-events")

type EventHandlerFn = (event: EventEnvelope) => Effect.Effect<void, unknown>

/**
 * Maps event names to their handler functions.
 * An event can have multiple handlers; each runs concurrently.
 * To add a new event, add an entry here.
 */
const eventHandlers: Record<string, EventHandlerFn[]> = {
  MagicLinkEmailRequested: [handleMagicLinkEmailRequested],
}

const dispatch = (event: EventEnvelope): Effect.Effect<void, unknown> => {
  const handlers = eventHandlers[event.event.name]

  if (!handlers || handlers.length === 0) {
    return Effect.sync(() => logger.info(`No handlers for event ${event.event.name} (id=${event.id}), skipping`))
  }

  return Effect.all(
    handlers.map((handler) => handler(event)),
    { concurrency: "unbounded" },
  ).pipe(Effect.asVoid)
}

export const createDomainEventsWorker = (consumer: QueueConsumer) => {
  consumer.subscribe("domain-events", createEventHandler({ handle: dispatch }))
}
