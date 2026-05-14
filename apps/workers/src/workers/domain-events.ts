import { BILLING_OVERAGE_SYNC_THROTTLE_MS, buildBillingOverageDedupeKey } from "@domain/billing"
import type { DomainEvent, EventEnvelope, EventPayloads } from "@domain/events"
import { ESCALATION_CHECK_THROTTLE_MS, ESCALATION_RECHECK_DELAY_MS, ISSUE_REFRESH_THROTTLE_MS } from "@domain/issues"
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
                  { dedupeKey: `projects:first-trace:${event.payload.projectId}` },
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
    // annotation stream cannot starve the refresh. The escalation check fans
    // out twice in tandem: a 15-min throttled push (catches escalation
    // STARTS quickly while activity is high) and a debounced recheck that
    // only fires after `ESCALATION_RECHECK_DELAY_MS` of quiet on the same
    // issue (catches escalation ENDS once scoring stops — the recent
    // occurrence count organically drops below the exit threshold). Different
    // dedupeKeys so the throttle and the debounce don't collide.
    ScoreAssignedToIssue: (event) =>
      Effect.all(
        [
          pub.publish("issues", "refresh", event.payload, {
            dedupeKey: `issues:refresh:${event.payload.issueId}`,
            throttleMs: ISSUE_REFRESH_THROTTLE_MS,
          }),
          pub.publish("issues", "checkEscalation", event.payload, {
            dedupeKey: `issues:check-escalation:${event.payload.issueId}`,
            throttleMs: ESCALATION_CHECK_THROTTLE_MS,
          }),
          pub.publish("issues", "checkEscalation", event.payload, {
            dedupeKey: `issues:check-escalation-recheck:${event.payload.issueId}`,
            debounceMs: ESCALATION_RECHECK_DELAY_MS,
          }),
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid),

    IssueCreated: (event) =>
      pub.publish("alert-incidents", "issue-created", event.payload, {
        dedupeKey: `alert-incidents:issue.new:${event.payload.issueId}`,
      }),

    IssueRegressed: (event) =>
      pub.publish("alert-incidents", "issue-regressed", event.payload, {
        dedupeKey: `alert-incidents:issue.regressed:${event.payload.issueId}:${event.payload.triggerScoreId}`,
      }),

    IssueEscalated: (event) =>
      pub.publish("alert-incidents", "issue-escalated", event.payload, {
        dedupeKey: `alert-incidents:issue.escalating:${event.payload.issueId}:${event.payload.escalatedAt}`,
      }),

    IssueEscalationEnded: (event) =>
      pub.publish("alert-incidents", "issue-escalation-ended", event.payload, {
        dedupeKey: `alert-incidents:issue.escalation-ended:${event.payload.issueId}:${event.payload.endedAt}`,
      }),

    IncidentCreated: (event) =>
      pub.publish(
        "notifications",
        "create-from-incident-opened",
        { organizationId: event.payload.organizationId, alertIncidentId: event.payload.alertIncidentId },
        { dedupeKey: `notifications:incident-opened:${event.payload.alertIncidentId}` },
      ),

    IncidentClosed: (event) =>
      pub.publish(
        "notifications",
        "create-from-incident-closed",
        { organizationId: event.payload.organizationId, alertIncidentId: event.payload.alertIncidentId },
        { dedupeKey: `notifications:incident-closed:${event.payload.alertIncidentId}` },
      ),

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

    // OrganizationCreated and MemberJoined have no marketing-contacts side
    // effect — the only thing that mattered was syncing organizationId onto
    // each Loops contact, which we no longer do (members get telemetryEnabled
    // fanned out individually on FirstTraceReceived). PostHog fan-out is
    // applied automatically below because both events are on the whitelist.
    OrganizationCreated: () => Effect.void,

    ProjectCreated: (event) =>
      pub.publish("projects", "provision", event.payload, {
        dedupeKey: `projects:provision:${event.payload.projectId}`,
      }),

    UserSignedUp: (event) =>
      pub.publish(
        "marketing-contacts",
        "register-user",
        { userId: event.payload.userId },
        { dedupeKey: `marketing-contacts:register-user:${event.payload.userId}` },
      ),

    UserOnboardingCompleted: (event) =>
      pub.publish(
        "marketing-contacts",
        "update-onboarding",
        { userId: event.payload.userId, stackChoice: event.payload.stackChoice },
        { dedupeKey: `marketing-contacts:update-onboarding:${event.payload.userId}` },
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
        { dedupeKey: `marketing-contacts:mark-telemetry-enabled:${event.payload.organizationId}` },
      ),

    MemberInvited: () => Effect.void,
    ApiKeyCreated: () => Effect.void,
    OAuthKeyCreated: () => Effect.void,
    DatasetCreated: () => Effect.void,
    EvaluationConfigured: () => Effect.void,
    AnnotationQueueItemCompleted: () => Effect.void,
    ProjectDeleted: () => Effect.void,
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
