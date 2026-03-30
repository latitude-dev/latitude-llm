import type { DomainEvent, EventEnvelope, EventPayloads } from "@domain/events"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { EventEnvelopeSchema } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { Data, Effect } from "effect"

class UnhandledEventError extends Data.TaggedError("UnhandledEventError")<{
  readonly name: string
  readonly eventId: string
}> {}

const logger = createLogger("domain-events")

export const TRACE_END_DEBOUNCE_MS = 5 * 60 * 1000
export const ISSUE_REFRESH_DEBOUNCE_MS = 8 * 60 * 60 * 1000

type EventHandlerMap = {
  [E in keyof EventPayloads]: (event: DomainEvent<E, EventPayloads[E]>) => Effect.Effect<void, unknown>
}

type EventHandlerFn = (e: DomainEvent) => Effect.Effect<void, unknown>

export const createDomainEventsWorker = ({
  consumer,
  publisher: pub,
}: {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
}) => {
  const handlers: EventHandlerMap = {
    MagicLinkEmailRequested: (event) => pub.publish("magic-link-email", "send", event.payload),

    InvitationEmailRequested: (event) => pub.publish("invitation-email", "send", event.payload),

    UserDeletionRequested: (event) => pub.publish("user-deletion", "delete", event.payload),

    SpanIngested: (event) =>
      pub.publish("live-traces", "end", event.payload, {
        dedupeKey: `live-traces:end:${event.organizationId}:${event.payload.projectId}:${event.payload.traceId}`,
        debounceMs: TRACE_END_DEBOUNCE_MS,
      }),

    TraceEnded: (event) =>
      Effect.all(
        [
          pub.publish("live-evaluations", "enqueue", event.payload),
          pub.publish("live-annotation-queues", "curate", event.payload),
          pub.publish("system-annotation-queues", "flag", event.payload),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    ScoreImmutable: (event) =>
      Effect.all(
        [
          pub.publish("analytic-scores", "save", {
            organizationId: event.payload.organizationId,
            projectId: event.payload.projectId,
            scoreId: event.payload.scoreId,
          }),
          ...(event.payload.issueId === null
            ? []
            : [
                pub.publish(
                  "issues",
                  "refresh",
                  {
                    organizationId: event.payload.organizationId,
                    projectId: event.payload.projectId,
                    issueId: event.payload.issueId,
                  },
                  {
                    dedupeKey: `issues:refresh:${event.payload.issueId}`,
                    debounceMs: ISSUE_REFRESH_DEBOUNCE_MS,
                  },
                ),
              ]),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    OrganizationCreated: (event) =>
      pub.publish("api-keys", "create", {
        organizationId: event.payload.organizationId,
        name: "Default API Key",
      }),
  }

  consumer.subscribe("domain-events", {
    dispatch: (payload) => {
      const parsed = EventEnvelopeSchema.safeParse(payload)
      if (!parsed.success) {
        logger.error(`Failed to parse domain event envelope: ${parsed.error}`)
        return Effect.void
      }

      const envelope = parsed.data as EventEnvelope<DomainEvent>
      const { event } = envelope
      const name = event.name as keyof EventPayloads

      const maybeHandler = handlers[name]

      if (!maybeHandler) {
        const err = new UnhandledEventError({
          name: event.name,
          eventId: envelope.id,
        })
        return Effect.fail(err)
      }

      // Force type in runtime
      const handler = maybeHandler as EventHandlerFn
      return handler(event)
    },
  })
}
