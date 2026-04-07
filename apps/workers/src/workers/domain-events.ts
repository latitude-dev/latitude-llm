import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import type { DomainEvent, EventEnvelope, EventPayloads } from "@domain/events"
import { ISSUE_REFRESH_DEBOUNCE_MS } from "@domain/issues"
import type { QueueConsumer, QueuePublisherShape, WorkflowStarterShape } from "@domain/queue"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"
import { EventEnvelopeSchema } from "@platform/queue-bullmq"
import { createLogger, serializeError } from "@repo/observability"
import { hash } from "@repo/utils"
import { Data, Effect, Result, Schedule } from "effect"

class UnhandledEventError extends Data.TaggedError("UnhandledEventError")<{
  readonly name: string
  readonly eventId: string
}> {}

class TraceEndedFanOutError extends Data.TaggedError("TraceEndedFanOutError")<{
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly failedLegs: ReadonlyArray<{ readonly leg: string; readonly error: unknown }>
}> {}

const logger = createLogger("domain-events")

/** Retries after the first failure: `recurs(n)` -> n retries (n+1 attempts total). */
const traceEndedFanoutRetrySchedule = Schedule.exponential("50 millis").pipe(Schedule.compose(Schedule.recurs(4)))

const traceEndedPublishLeg = (
  pub: QueuePublisherShape,
  queue: "live-evaluations" | "live-annotation-queues" | "system-annotation-queues",
  task: string,
  payload: { readonly organizationId: string; readonly projectId: string; readonly traceId: string },
  dedupeKey: string,
) =>
  Effect.suspend(() => pub.publish(queue, task as never, payload as never, { dedupeKey })).pipe(
    Effect.retry(traceEndedFanoutRetrySchedule),
    Effect.result,
  )
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
          traceEndedPublishLeg(
            pub,
            "live-evaluations",
            "enqueue",
            event.payload,
            `trace-ended:live-evaluations:${event.payload.organizationId}:${event.payload.projectId}:${event.payload.traceId}`,
          ),
          traceEndedPublishLeg(
            pub,
            "live-annotation-queues",
            "curate",
            event.payload,
            `trace-ended:live-annotation-queues:${event.payload.organizationId}:${event.payload.projectId}:${event.payload.traceId}`,
          ),
          traceEndedPublishLeg(
            pub,
            "system-annotation-queues",
            "flag",
            event.payload,
            `trace-ended:system-annotation-queues:${event.payload.organizationId}:${event.payload.projectId}:${event.payload.traceId}`,
          ),
        ],
        { concurrency: "unbounded", mode: "result" },
      ).pipe(
        Effect.flatMap((results) => {
          const legs = ["live-evaluations:enqueue", "live-annotation-queues:curate", "system-annotation-queues:flag"]
          const succeeded = results.filter((outer) => Result.isSuccess(outer) && Result.isSuccess(outer.success)).length
          const failedLegs = results.flatMap((outer, i) => {
            if (!Result.isSuccess(outer)) {
              return []
            }
            const inner = outer.success
            return Result.isFailure(inner)
              ? [{ leg: legs[i] ?? `index-${i}`, error: serializeError(inner.failure) }]
              : []
          })
          if (failedLegs.length === 0) {
            return Effect.void
          }
          logger.error("TraceEnded fan-out: one or more legs failed after retries", {
            organizationId: event.payload.organizationId,
            projectId: event.payload.projectId,
            traceId: event.payload.traceId,
            succeededLegs: succeeded,
            failedLegs,
          })
          return Effect.fail(
            new TraceEndedFanOutError({
              organizationId: event.payload.organizationId,
              projectId: event.payload.projectId,
              traceId: event.payload.traceId,
              failedLegs,
            }),
          )
        }),
      ),

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
