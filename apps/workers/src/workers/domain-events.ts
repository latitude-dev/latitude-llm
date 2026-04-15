import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import type { DomainEvent, EventEnvelope, EventPayloads } from "@domain/events"
import { ISSUE_REFRESH_DEBOUNCE_MS } from "@domain/issues"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { SCORE_PUBLICATION_DEBOUNCE } from "@domain/scores"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"
import { isPostHogTracked } from "@platform/analytics-posthog"
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
}: {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
}) => {
  const buildTraceEndedDedupeKey = (prefix: string, payload: EventPayloads["TraceEnded"]) =>
    `${prefix}:${payload.organizationId}:${payload.projectId}:${payload.traceId}`

  const publishTraceEndedFanOut = (payload: EventPayloads["TraceEnded"]) =>
    Effect.all(
      [
        pub.publish("live-evaluations", "enqueue", payload, {
          dedupeKey: buildTraceEndedDedupeKey("evaluations:live:enqueue", payload),
        }),
        pub.publish("live-annotation-queues", "curate", payload, {
          dedupeKey: buildTraceEndedDedupeKey("annotation-queues:live:curate", payload),
        }),
        pub.publish("system-annotation-queues", "fanOut", payload, {
          dedupeKey: buildTraceEndedDedupeKey("annotation-queues:system:fan-out", payload),
        }),
      ],
      { concurrency: "unbounded" },
    ).pipe(Effect.asVoid)

  const publishScoreDraftSavedFanOut = (payload: EventPayloads["ScoreDraftSaved"]) =>
    Effect.all(
      [
        pub.publish("annotation-scores", "publishHumanAnnotation", payload, {
          dedupeKey: `annotation-scores:publish-human:${payload.scoreId}`,
          debounceMs: SCORE_PUBLICATION_DEBOUNCE,
        }),
        pub.publish("annotation-scores", "markReviewStarted", payload, {
          dedupeKey: `annotation-scores:mark-review-started:${payload.scoreId}`,
        }),
      ],
      { concurrency: "unbounded" },
    ).pipe(Effect.asVoid)

  const publishScorePublishedFanOut = (payload: EventPayloads["ScorePublished"]) =>
    pub.publish("issues", "discovery", payload, {
      dedupeKey: `issues:discovery:${payload.scoreId}`,
    })

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
      Effect.all(
        [
          pub.publish("live-traces", "end", event.payload, {
            dedupeKey: `live-traces:end:${event.payload.organizationId}:${event.payload.projectId}:${event.payload.traceId}`,
            debounceMs: TRACE_END_DEBOUNCE_MS,
          }),
          pub.publish(
            "projects",
            "checkFirstTrace",
            {
              organizationId: event.payload.organizationId,
              projectId: event.payload.projectId,
              traceId: event.payload.traceId,
            },
            { dedupeKey: `projects:first-trace:${event.payload.projectId}` },
          ),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    TraceEnded: (event) => publishTraceEndedFanOut(event.payload),

    ScoreDraftSaved: (event) => publishScoreDraftSavedFanOut(event.payload),
    ScorePublished: (event) => publishScorePublishedFanOut(event.payload),

    ScoreAssignedToIssue: (event) =>
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

    ProjectCreated: (event) =>
      pub.publish("projects", "provision", event.payload, {
        dedupeKey: `projects:provision:${event.payload.projectId}`,
      }),

    UserSignedUp: () => Effect.void,
    MemberJoined: () => Effect.void,
    MemberInvited: () => Effect.void,
    ApiKeyCreated: () => Effect.void,
    DatasetCreated: () => Effect.void,
    EvaluationConfigured: () => Effect.void,
    AnnotationQueueItemCompleted: () => Effect.void,
    ProjectDeleted: () => Effect.void,
    FirstTraceReceived: () => Effect.void,
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

      const handler = maybeHandler as EventHandlerFn
      const primary = handler(event)

      if (!isPostHogTracked(event.name)) {
        return primary
      }

      // PostHog fan-out is fire-and-forget: its failure must never propagate
      // through Effect.all and cause the primary handler to be retried (which
      // would double-run effects like api-key creation or project provisioning).
      const analytics = pub
        .publish(
          "posthog-analytics",
          "track",
          {
            eventName: event.name,
            organizationId: event.organizationId,
            payload: event.payload,
            occurredAt: envelope.occurredAt.toISOString(),
          },
          { dedupeKey: `posthog:${envelope.id}` },
        )
        .pipe(
          Effect.catch((e: unknown) =>
            Effect.sync(() => logger.warn(`posthog fan-out publish failed for ${event.name}`, e)),
          ),
        )

      return Effect.all([primary, analytics], { concurrency: "unbounded" }).pipe(Effect.asVoid)
    },
  })
}
