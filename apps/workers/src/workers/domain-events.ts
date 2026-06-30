import { BILLING_OVERAGE_SYNC_THROTTLE_MS, buildBillingOverageDedupeKey } from "@domain/billing"
import type { DomainEvent, EventEnvelope, EventPayloads } from "@domain/events"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { SCORE_PUBLICATION_DEBOUNCE } from "@domain/scores"
import { ESCALATION_CHECK_THROTTLE_MS, SIGNAL_REFRESH_THROTTLE_MS } from "@domain/signals"
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

// TODO(signals): remove once the outbox + domain-events queue have fully drained of legacy
// `Issue*` event names (post-deploy). Bridges in-flight rows written before the rename so they
// still dispatch instead of dead-lettering on UnhandledEventError.
const EVENT_NAME_ALIASES: Record<string, keyof EventPayloads> = {
  IssueCreated: "SignalCreated",
  IssueEscalated: "SignalEscalated",
  IssueAssigneeChanged: "SignalAssigneeChanged",
  IssueEscalationEnded: "SignalEscalationEnded",
  ScoreAssignedToIssue: "ScoreAssignedToSignal",
}

export const createDomainEventsWorker = ({
  consumer,
  publisher: pub,
}: {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
}) => {
  const buildTraceIngestedDedupeKey = (
    prefix: string,
    input: { organizationId: string; projectId: string; traceId: string },
  ) => `${prefix}:${input.organizationId}:${input.projectId}:${input.traceId}`

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

    TracesIngested: (event) => {
      const [firstTraceId] = event.payload.traceIds
      const isSandbox = event.payload.isSandbox ?? false
      return Effect.all(
        [
          ...event.payload.traceIds.map((traceId) =>
            pub.publish(
              "trace-end",
              "run",
              {
                organizationId: event.payload.organizationId,
                projectId: event.payload.projectId,
                traceId,
                isSandbox,
              },
              {
                dedupeKey: buildTraceIngestedDedupeKey("trace-end:run", {
                  organizationId: event.payload.organizationId,
                  projectId: event.payload.projectId,
                  traceId,
                }),
                debounceMs: TRACE_END_DEBOUNCE_MS,
              },
            ),
          ),
          // The signals matching pipeline runs every active evaluation against the trace. Published
          // unconditionally with `isSandbox` in the payload (like trace-end); the consumer skips
          // sandbox traces. Debounced like trace-end so evaluations fire on the settled trace.
          ...event.payload.traceIds.map((traceId) =>
            pub.publish(
              "signals",
              "match",
              {
                organizationId: event.payload.organizationId,
                projectId: event.payload.projectId,
                traceId,
                isSandbox,
              },
              {
                dedupeKey: buildTraceIngestedDedupeKey("signals:match", {
                  organizationId: event.payload.organizationId,
                  projectId: event.payload.projectId,
                  traceId,
                }),
                debounceMs: TRACE_END_DEBOUNCE_MS,
              },
            ),
          ),
          // Not gated on `isSandbox`: first-trace detection is onboarding/marketing
          // telemetry, not LLM work. Outbound marketing/notification suppression for
          // sandbox orgs is AGE-113's concern (handled downstream), not this PR's.
          ...(firstTraceId
            ? [
                pub.publish(
                  "projects",
                  "checkFirstTrace",
                  {
                    organizationId: event.payload.organizationId,
                    projectId: event.payload.projectId,
                    traceId: firstTraceId,
                  },
                  {
                    dedupeKey: `projects:first-trace:${event.payload.projectId}`,
                  },
                ),
              ]
            : []),
          ...(event.payload.billing
            ? [
                pub.publish(
                  "billing",
                  "recordTraceUsageBatch",
                  {
                    organizationId: event.payload.organizationId,
                    projectId: event.payload.projectId,
                    traceIds: event.payload.traceIds,
                    planSlug: event.payload.billing.planSlug,
                    planSource: event.payload.billing.planSource,
                    periodStart: event.payload.billing.periodStart,
                    periodEnd: event.payload.billing.periodEnd,
                    includedCredits: event.payload.billing.includedCredits,
                    overageAllowed: event.payload.billing.overageAllowed,
                    isSandbox,
                  },
                  {
                    attempts: 10,
                    backoff: { type: "exponential", delayMs: 1_000 },
                  },
                ),
              ]
            : []),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid)
    },

    ScoreCreated: (event) => publishScoreCreatedFanOut(event.payload),

    // Throttled: the first assignment schedules the refresh for `now + 8h`,
    // and subsequent assignments within the window are dropped so a constant
    // annotation stream cannot starve the refresh. The escalation check is
    // pushed under a 15-min throttle so it fires within at most that window
    // of any new score — the same check evaluates BOTH entry and exit, so
    // an actively-burning issue gets exit-evaluated every 15 minutes for
    // free. Once activity stops, the hourly `sweepEscalating` cron takes
    // over (see `apps/workers/src/server.ts`) — that's what guarantees the
    // dwell / 24h backstop / 72h timeout exits actually fire when no more
    // `ScoreAssignedToSignal` events arrive.
    ScoreAssignedToSignal: (event) =>
      Effect.all(
        [
          pub.publish("issues", "refresh", event.payload, {
            dedupeKey: `issues:refresh:${event.payload.signalId}`,
            throttleMs: SIGNAL_REFRESH_THROTTLE_MS,
          }),
          pub.publish("issues", "checkEscalation", event.payload, {
            dedupeKey: `issues:check-escalation:${event.payload.signalId}`,
            throttleMs: ESCALATION_CHECK_THROTTLE_MS,
          }),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    SignalCreated: (event) =>
      Effect.all(
        [
          pub.publish(
            "notifications",
            "request-signal-discovered-notifications",
            {
              organizationId: event.payload.organizationId,
              projectId: event.payload.projectId,
              signalId: event.payload.signalId,
              discoveredAt: event.payload.createdAt,
            },
            {
              dedupeKey: `notifications:request-signal-discovered:${event.payload.signalId}`,
            },
          ),
          pub.publish(
            "agent-dispatch",
            "request",
            {
              organizationId: event.payload.organizationId,
              projectId: event.payload.projectId,
              signalId: event.payload.signalId,
              source: "signal",
            },
            {
              dedupeKey: `agent-dispatch:request-signal:${event.payload.signalId}`,
            },
          ),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    SignalEscalated: (event) =>
      pub.publish("alert-incidents", "signal-escalated", event.payload, {
        dedupeKey: `alert-incidents:signal.escalating:${event.payload.signalId}:${event.payload.escalatedAt}`,
      }),

    SignalEscalationEnded: (event) =>
      pub.publish("alert-incidents", "signal-escalation-ended", event.payload, {
        dedupeKey: `alert-incidents:signal.escalation-ended:${event.payload.signalId}:${event.payload.endedAt}`,
      }),

    SavedSearchDeleted: (event) =>
      pub.publish(
        "monitors",
        "onSourceDeleted",
        {
          organizationId: event.payload.organizationId,
          projectId: event.payload.projectId,
          sourceType: "savedSearch",
          sourceId: event.payload.searchId,
        },
        {
          dedupeKey: `monitors:on-source-deleted:savedSearch:${event.payload.searchId}`,
        },
      ),

    IncidentCreated: (event) =>
      Effect.all(
        [
          pub.publish(
            "notifications",
            "request-incident-notifications",
            {
              organizationId: event.payload.organizationId,
              alertIncidentId: event.payload.alertIncidentId,
              transition: "created",
            },
            {
              dedupeKey: `notifications:request-incident-created:${event.payload.alertIncidentId}`,
            },
          ),
          pub.publish(
            "agent-dispatch",
            "request",
            {
              organizationId: event.payload.organizationId,
              alertIncidentId: event.payload.alertIncidentId,
              source: "incident",
            },
            {
              dedupeKey: `agent-dispatch:request-incident:${event.payload.alertIncidentId}`,
            },
          ),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    SignalAssigneeChanged: (event) =>
      // Cleared assignments and self-assignments never notify; the producer
      // use case re-checks both (the rule's testable home). `assignedAt`
      // discriminates assignment events so a later re-assignment republishes
      // while outbox redelivery of the same event coalesces.
      event.payload.assigneeId === null || event.payload.assigneeId === event.payload.actorUserId
        ? Effect.void
        : pub.publish(
            "notifications",
            "request-signal-assigned-notifications",
            {
              organizationId: event.payload.organizationId,
              signalId: event.payload.signalId,
              assigneeId: event.payload.assigneeId,
              actorUserId: event.payload.actorUserId,
              assignedAt: event.payload.assignedAt,
            },
            {
              dedupeKey: `notifications:request-signal-assigned:${event.payload.signalId}:${event.payload.assignedAt}`,
            },
          ),

    IncidentClosed: (event) =>
      // Manual lifecycle closes (the user resolved or ignored the issue) close
      // the escalation silently — the recovery notification is meant for
      // organic recovery, not a deliberate user action. Organic exits
      // (threshold/absolute-rate-drop/timeout) still notify.
      event.payload.reason === "resolved" || event.payload.reason === "ignored"
        ? Effect.void
        : pub.publish(
            "notifications",
            "request-incident-notifications",
            {
              organizationId: event.payload.organizationId,
              alertIncidentId: event.payload.alertIncidentId,
              transition: "closed",
            },
            {
              dedupeKey: `notifications:request-incident-closed:${event.payload.alertIncidentId}`,
            },
          ),

    AnnotationDeleted: (event) => {
      const { organizationId, projectId, scoreId, signalId, draftedAt, feedback, source, createdAt } = event.payload

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
            {
              organizationId,
              projectId,
              scoreId,
              signalId,
              draftedAt,
              feedback,
              source,
              createdAt,
            },
            { dedupeKey: `issues:remove-score:${scoreId}` },
          ),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid)
    },

    // OrganizationCreated and MemberJoined have no marketing-contacts side
    // effect — the only thing that mattered was syncing organizationId onto
    // each Loops contact, which we no longer do (members get telemetryEnabled
    // fanned out individually on FirstTraceReceived). PostHog fan-out is
    // applied automatically below because both events are on the whitelist.
    OrganizationCreated: () => Effect.void,

    SampleProjectCreated: (event) =>
      pub.publish("projects", "seedDemo", event.payload, {
        dedupeKey: `projects:seed-demo:${event.payload.projectId}`,
        attempts: 10,
        backoff: { type: "exponential", delayMs: 1_000 },
      }),

    ProjectCreated: (event) =>
      pub.publish("projects", "provision", event.payload, {
        dedupeKey: `projects:provision:${event.payload.projectId}`,
      }),

    UserSignedUp: (event) =>
      pub.publish(
        "marketing-contacts",
        "register-user",
        { userId: event.payload.userId },
        {
          dedupeKey: `marketing-contacts:register-user:${event.payload.userId}`,
        },
      ),

    UserOnboardingCompleted: (event) =>
      pub.publish(
        "marketing-contacts",
        "update-onboarding",
        {
          userId: event.payload.userId,
          stackChoice: event.payload.stackChoice,
        },
        {
          dedupeKey: `marketing-contacts:update-onboarding:${event.payload.userId}`,
        },
      ),

    BillingUsagePeriodUpdated: (event) => {
      if (
        event.payload.planSource !== "subscription" ||
        !event.payload.overageAllowed ||
        event.payload.overageCredits <= event.payload.reportedOverageCredits
      ) {
        return Effect.void
      }

      const periodStart = new Date(event.payload.periodStart)
      const periodEnd = new Date(event.payload.periodEnd)

      return pub.publish(
        "billing-overage",
        "reportOverage",
        {
          organizationId: event.payload.organizationId,
          periodStart: event.payload.periodStart,
          periodEnd: event.payload.periodEnd,
          snapshotOverageCredits: event.payload.overageCredits,
        },
        {
          dedupeKey: buildBillingOverageDedupeKey({
            organizationId: event.payload.organizationId,
            periodStart,
            periodEnd,
          }),
          latestThrottleMs: BILLING_OVERAGE_SYNC_THROTTLE_MS,
          attempts: 10,
          backoff: { type: "exponential", delayMs: 1_000 },
        },
      )
    },

    MemberJoined: () => Effect.void,

    FirstTraceReceived: (event) =>
      pub.publish(
        "marketing-contacts",
        "mark-telemetry-enabled",
        { organizationId: event.payload.organizationId },
        {
          dedupeKey: `marketing-contacts:mark-telemetry-enabled:${event.payload.organizationId}`,
        },
      ),

    MemberInvited: () => Effect.void,
    ApiKeyCreated: () => Effect.void,
    OAuthKeyCreated: () => Effect.void,
    DatasetCreated: () => Effect.void,
    EvaluationCreated: () => Effect.void,
    EvaluationAligned: () => Effect.void,
    // Detector-health degradation is audit-only for now: the outbox row is
    // the durable surfacing until a notification kind lands with the signals
    // rollout (specs/sandbox-runtime.md P1-2).
    EvaluationDetectorDegraded: () => Effect.void,
    AnnotationQueueItemCompleted: () => Effect.void,
    ProjectDeleted: (event) =>
      Effect.all(
        [
          pub.publish(
            "notifications",
            "delete-by-project",
            {
              organizationId: event.payload.organizationId,
              projectId: event.payload.projectId,
            },
            {
              dedupeKey: `notifications:delete-by-project:${event.payload.projectId}`,
            },
          ),
          pub.publish(
            "destinations",
            "delete-by-project",
            {
              organizationId: event.payload.organizationId,
              projectId: event.payload.projectId,
            },
            {
              dedupeKey: `destinations:delete-by-project:${event.payload.projectId}`,
            },
          ),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),
    FlaggerToggled: () => Effect.void,
    SavedSearchCreated: () => Effect.void,
    // Impersonation events are audit-only — their value is being
    // persisted in the outbox for support / compliance queries.
    // No downstream worker consumes them, so these handlers are no-ops.
    // Present here only because `EventHandlerMap` exhaustively covers
    // every key in `EventPayloads` and would fail typecheck otherwise.
    AdminImpersonationStarted: () => Effect.void,
    AdminImpersonationStopped: () => Effect.void,
    AdminUserRoleChanged: () => Effect.void,
    AdminUserEmailChanged: () => Effect.void,
    AdminUserSessionsRevoked: () => Effect.void,
    AdminUserSessionRevoked: () => Effect.void,
    AdminDemoProjectSeeded: () => Effect.void,
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
      const name = (EVENT_NAME_ALIASES[event.name] ?? event.name) as keyof EventPayloads

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

      return Effect.all([primary, analytics], {
        concurrency: "unbounded",
      }).pipe(Effect.asVoid, withTracing)
    },
  })
}
