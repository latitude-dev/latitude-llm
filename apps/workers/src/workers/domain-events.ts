import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import type { DomainEvent, EventEnvelope, EventPayloads } from "@domain/events"
import { ISSUE_REFRESH_THROTTLE_MS } from "@domain/issues"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { SCORE_PUBLICATION_DEBOUNCE } from "@domain/scores"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"
import { isPostHogTracked } from "@platform/analytics-posthog"
import { EventEnvelopeSchema } from "@platform/queue-bullmq"
import { createLogger, withTracing } from "@repo/observability"
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
  const buildSpanIngestedDedupeKey = (prefix: string, payload: EventPayloads["SpanIngested"]) =>
    `${prefix}:${payload.organizationId}:${payload.projectId}:${payload.traceId}`

  const publishScoreCreatedFanOut = (payload: EventPayloads["ScoreCreated"]) =>
    Effect.all(
      [
        pub.publish("issues", "discovery", payload, {
          dedupeKey: `issues:discovery:${payload.scoreId}:${payload.status}`,
        }),
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
          pub.publish("trace-end", "run", event.payload, {
            dedupeKey: buildSpanIngestedDedupeKey("trace-end:run", event.payload),
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

    ScoreCreated: (event) => publishScoreCreatedFanOut(event.payload),

    // Throttled: the first assignment schedules the refresh for `now + 8h`,
    // and subsequent assignments within the window are dropped so a constant
    // annotation stream cannot starve the refresh.
    ScoreAssignedToIssue: (event) =>
      pub.publish("issues", "refresh", event.payload, {
        dedupeKey: `issues:refresh:${event.payload.issueId}`,
        throttleMs: ISSUE_REFRESH_THROTTLE_MS,
      }),

    AnnotationDeleted: (event) => {
      const { organizationId, projectId, scoreId, issueId, draftedAt, feedback, source, createdAt } = event.payload

      return Effect.all(
        [
          pub.publish(
            "scores",
            "delete-analytics",
            { organizationId, scoreId },
            { dedupeKey: `scores:delete-analytics:${scoreId}` },
          ),
          pub.publish(
            "issues",
            "removeScore",
            { organizationId, projectId, scoreId, issueId, draftedAt, feedback, source, createdAt },
            { dedupeKey: `issues:remove-score:${scoreId}` },
          ),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid)
    },

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
    // Impersonation events are audit-only — their value is being
    // persisted in the outbox for support / compliance queries.
    // No downstream worker consumes them, so these handlers are no-ops.
    // Present here only because `EventHandlerMap` exhaustively covers
    // every key in `EventPayloads` and would fail typecheck otherwise.
    AdminImpersonationStarted: () => Effect.void,
    AdminImpersonationStopped: () => Effect.void,
    AdminUserRoleChanged: () => Effect.void,
    AdminUserEmailChanged: () => Effect.void,
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

      return Effect.all([primary, analytics], { concurrency: "unbounded" }).pipe(Effect.asVoid, withTracing)
    },
  })
}
