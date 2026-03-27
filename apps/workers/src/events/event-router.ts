import type { DomainEvent, EventPayloads } from "@domain/events"
import { RouteError } from "@domain/events"
import type { QueuePublisherShape } from "@domain/queue"
import { Effect } from "effect"
import type { EventHandlerMap, EventRouter } from "./types.ts"

const TRACE_END_DEBOUNCE_MS = 5 * 60 * 1000 // 5 minutes
const ISSUE_REFRESH_DEBOUNCE_MS = 8 * 60 * 60 * 1000 // 8 hours

type EventHandlerFn = (e: DomainEvent) => Effect.Effect<void, unknown>

export const createEventRouter = (queuePublisher: QueuePublisherShape): EventRouter => {
  const handlers: EventHandlerMap = {
    MagicLinkEmailRequested: (event) => queuePublisher.publish("magic-link-email", "send", event.payload),

    UserDeletionRequested: (event) => queuePublisher.publish("user-deletion", "delete", event.payload),

    SpanIngested: (event) =>
      queuePublisher.publish("live-traces", "end", event.payload, {
        dedupeKey: `live-traces:end:${event.organizationId}:${event.payload.projectId}:${event.payload.traceId}`,
        debounceMs: TRACE_END_DEBOUNCE_MS,
      }),

    TraceEnded: (event) =>
      Effect.all(
        [
          queuePublisher.publish("live-evaluations", "enqueue", event.payload),
          queuePublisher.publish("live-annotation-queues", "curate", event.payload),
          queuePublisher.publish("system-annotation-queues", "flag", event.payload),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    ScoreImmutable: (event) =>
      Effect.all(
        [
          queuePublisher.publish("analytic-scores", "save", {
            organizationId: event.payload.organizationId,
            projectId: event.payload.projectId,
            scoreId: event.payload.scoreId,
          }),
          ...(event.payload.issueId === null
            ? []
            : [
                queuePublisher.publish(
                  "issues",
                  "refresh",
                  {
                    organizationId: event.payload.organizationId,
                    projectId: event.payload.projectId,
                    issueId: event.payload.issueId,
                  },
                  { dedupeKey: `issues:refresh:${event.payload.issueId}`, debounceMs: ISSUE_REFRESH_DEBOUNCE_MS },
                ),
              ]),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    OrganizationCreated: (event) =>
      queuePublisher.publish("api-keys", "create", {
        organizationId: event.payload.organizationId,
        name: "Default API Key",
      }),
  }

  return (event: DomainEvent): Effect.Effect<void, RouteError> => {
    const name = event.name as keyof EventPayloads
    const maybeHandler = handlers[name]

    if (!maybeHandler) {
      return Effect.fail(new RouteError(`No handler registered for event type: ${event.name}`, event.name))
    }

    // Force type in runtime
    const handler = maybeHandler as EventHandlerFn
    return handler(event).pipe(
      Effect.mapError((cause) => new RouteError(`Handler failed for event ${event.name}: ${cause}`, event.name, cause)),
    )
  }
}
