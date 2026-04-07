import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import type { DomainEvent, EventEnvelope, EventPayloads } from "@domain/events"
import { ISSUE_REFRESH_DEBOUNCE_MS } from "@domain/issues"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"
import { EventEnvelopeSchema } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { hash } from "@repo/utils"
import { Data, Effect } from "effect"

class UnhandledEventError extends Data.TaggedError("UnhandledEventError")<{
  readonly name: string
  readonly eventId: string
}> {}

const logger = createLogger("domain-events")

type EventHandlerMap = {
  [E in keyof EventPayloads]: (event: DomainEvent<E, EventPayloads[E]>) => Effect.Effect<void, unknown>
}

type EventHandlerFn = (e: DomainEvent) => Effect.Effect<void, unknown>

export const createDomainEventsWorker = ({
  consumer,
  publisher: pub,
  workflowStarter,
}: {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  workflowStarter: WorkflowStarterShape
}) => {
  const handlers: EventHandlerMap = {
    MagicLinkEmailRequested: (event) =>
      hash(event.payload.magicLinkUrl).pipe(
        Effect.flatMap((magicLinkHash) =>
          pub.publish("magic-link-email", "send", event.payload, {
            dedupeKey: `emails:magic-link:${magicLinkHash}`,
          }),
        ),
      ),

    InvitationEmailRequested: (event) =>
      hash(event.payload.invitationUrl).pipe(
        Effect.flatMap((invitationHash) =>
          pub.publish("invitation-email", "send", event.payload, {
            dedupeKey: `emails:invitation:${invitationHash}`,
          }),
        ),
      ),

    UserDeletionRequested: (event) =>
      pub.publish("user-deletion", "delete", event.payload, {
        dedupeKey: `users:deletion:${event.payload.userId}`,
      }),

    SpanIngested: (event) =>
      pub.publish("live-traces", "end", event.payload, {
        dedupeKey: `traces:live:end:${event.payload.traceId}`,
        debounceMs: TRACE_END_DEBOUNCE_MS,
      }),

    TraceEnded: (event) =>
      Effect.all(
        [
          pub.publish("live-evaluations", "enqueue", event.payload, {
            dedupeKey: `evaluations:live:enqueue:${event.payload.traceId}`,
          }),
          pub.publish("live-annotation-queues", "curate", event.payload, {
            dedupeKey: `annotation-queues:live:curate:${event.payload.traceId}`,
          }),
          pub.publish("system-annotation-queues", "flag", event.payload, {
            dedupeKey: `annotation-queues:system:flag:${event.payload.traceId}`,
          }),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    IssueDiscoveryRequested: (event) =>
      workflowStarter.start("issueDiscoveryWorkflow", event.payload, {
        workflowId: `issues:discovery:${event.payload.scoreId}`,
      }),

    IssueRefreshRequested: (event) =>
      pub.publish("issues", "refresh", event.payload, {
        dedupeKey: `issues:refresh:${event.payload.issueId}`,
        debounceMs: ISSUE_REFRESH_DEBOUNCE_MS,
      }),

    OrganizationCreated: (event) =>
      pub.publish(
        "api-keys",
        "create",
        {
          organizationId: event.payload.organizationId,
          name: DEFAULT_API_KEY_NAME,
        },
        {
          dedupeKey: `api-keys:create:${event.payload.organizationId}`,
        },
      ),
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
