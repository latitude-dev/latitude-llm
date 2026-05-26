import { FeatureFlagRepository } from "@domain/feature-flags"
import { SlackIntegrationRepository } from "@domain/integrations"
import {
  createNotificationUseCase,
  deleteNotificationsByProjectUseCase,
  NOTIFICATION_KIND_META,
  type NotificationKind,
  requestIncidentNotificationsUseCase,
  requestWrappedReportNotificationsUseCase,
} from "@domain/notifications"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AlertIncidentRepositoryLive,
  EvaluationRepositoryLive,
  FeatureFlagRepositoryLive,
  MembershipRepositoryLive,
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SlackIntegrationRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("notifications")

interface NotificationsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
}

const requestLayer = Layer.mergeAll(
  AlertIncidentRepositoryLive,
  EvaluationRepositoryLive,
  FeatureFlagRepositoryLive,
  MembershipRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SlackIntegrationRepositoryLive,
  UserRepositoryLive,
)

const createLayer = Layer.mergeAll(FeatureFlagRepositoryLive, NotificationRepositoryLive, UserRepositoryLive)

/**
 * Org-level Slack fan-out runs at the producer step (not per recipient).
 * Slack channel notifications are independent of the per-user create-
 * notification loop above: one Slack message per `(occurrence, route)`
 * regardless of recipient count. Skipped entirely when the `slack` flag
 * is off, the org has no active integration, or no routes are
 * configured for the kind's group.
 *
 * Idempotency comes from the worker (claim-then-act against
 * `slack_deliveries`), but the dedupeKey here lets BullMQ coalesce
 * duplicate publishes from outbox redelivery before the worker even
 * sees them.
 */
interface ProducerRequest {
  readonly organizationId: string
  readonly kind: string
  readonly idempotencyKey: string
  readonly projectId: string | null
  readonly payload: Record<string, unknown>
  /** One per-recipient notification ID (all share the same idempotencyKey).
   *  The first one is passed to Slack jobs for chart URL generation. */
  readonly notificationId: string
}

const fanOutSlackRoutes = (
  requests: readonly ProducerRequest[],
  publisher: QueuePublisherShape,
): Effect.Effect<void, never, FeatureFlagRepository | SlackIntegrationRepository | SqlClient> =>
  Effect.gen(function* () {
    if (requests.length === 0) return
    const first = requests[0]!

    const flags = yield* FeatureFlagRepository
    const slackEnabled = yield* flags.isEnabledForOrganization("slack")
    if (!slackEnabled) return

    const repo = yield* SlackIntegrationRepository
    const integration = yield* repo.findActiveByOrganizationId().pipe(Effect.orElseSucceed(() => null))
    if (!integration) return

    const kind = first.kind as NotificationKind
    const group = NOTIFICATION_KIND_META[kind]?.group
    if (!group) return
    const routes = integration.routes[group] ?? []
    if (routes.length === 0) return

    yield* Effect.all(
      routes.map((route) =>
        publisher.publish(
          "notification-slack",
          "send",
          {
            organizationId: first.organizationId,
            integrationId: integration.id,
            channelId: route.channelId,
            kind: first.kind,
            payload: first.payload,
            idempotencyKey: first.idempotencyKey,
            projectId: first.projectId,
            // Use the first recipient's notificationId so the chart
            // endpoint can load the trend payload from that row.
            // All rows for the same occurrence share the same payload;
            // the row will be committed before Slack fetches the image.
            notificationId: first.notificationId,
          },
          {
            dedupeKey: `notification-slack:${first.organizationId}:${first.idempotencyKey}:${route.channelId}`,
            // Retry on transient failures (rate-limit, transport). The
            // claim-then-post design means auth/channel-gone errors are
            // acked immediately by the worker; only genuinely retryable
            // failures (429, network) propagate for BullMQ to retry here.
            attempts: 4,
            backoff: { type: "exponential" as const, delayMs: 30_000 },
          },
        ),
      ),
      { concurrency: "unbounded" },
    )
  }).pipe(
    Effect.tapError((error) => Effect.sync(() => logger.warn("notifications.slack fan-out failed", error))),
    Effect.orElseSucceed(() => undefined),
  )

/**
 * Multi-step notification pipeline:
 *
 *   request-* (producer)       → publishes N create-notification tasks
 *   create-notification        → writes in-app row + conditionally publishes notification-email
 *   notification-email:send    → handled in `notification-emailer.ts`
 *   delete-by-project          → cascade cleanup on `ProjectDeleted`
 *
 * The producer step lives here (rather than inline in `domain-events.ts`)
 * because it needs DB access — incidents require a project-settings gate
 * + issue/project snapshot lookups, and the recipient resolver hits the
 * membership repo. Routing source events to "request-*" tasks keeps
 * `domain-events.ts` a pure router.
 */
export const createNotificationsWorker = ({ consumer, publisher }: NotificationsDeps) => {
  const pgClient = getPostgresClient()
  const chClient = getClickhouseClient()

  consumer.subscribe("notifications", {
    "request-incident-notifications": (payload) =>
      requestIncidentNotificationsUseCase({
        alertIncidentId: payload.alertIncidentId,
        transition: payload.transition,
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-incident skipped alertIncidentId=${payload.alertIncidentId} reason=${result.reason}`,
            )
            return Effect.void
          }
          return Effect.all(
            [
              Effect.all(
                result.requests.map((req) =>
                  publisher.publish(
                    "notifications",
                    "create-notification",
                    {
                      organizationId: req.organizationId,
                      userId: req.userId,
                      notificationId: req.notificationId,
                      kind: req.kind,
                      idempotencyKey: req.idempotencyKey,
                      projectId: req.projectId,
                      payload: req.payload,
                    },
                    { dedupeKey: `notifications:create:${req.idempotencyKey}:${req.userId}` },
                  ),
                ),
                { concurrency: "unbounded" },
              ),
              fanOutSlackRoutes(result.requests, publisher),
            ],
            { concurrency: "unbounded" },
          ).pipe(Effect.asVoid)
        }),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`notifications.request-incident failed alertIncidentId=${payload.alertIncidentId}`, error),
          ),
        ),
        withPostgres(requestLayer, pgClient, OrganizationId(payload.organizationId)),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),

    "request-wrapped-report-notifications": (payload) =>
      requestWrappedReportNotificationsUseCase({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
        wrappedReportId: payload.wrappedReportId,
        link: payload.link,
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-wrapped skipped wrappedReportId=${payload.wrappedReportId} reason=${result.reason}`,
            )
            return Effect.void
          }
          return Effect.all(
            [
              Effect.all(
                result.requests.map((req) =>
                  publisher.publish(
                    "notifications",
                    "create-notification",
                    {
                      organizationId: req.organizationId,
                      userId: req.userId,
                      notificationId: req.notificationId,
                      kind: req.kind,
                      idempotencyKey: req.idempotencyKey,
                      projectId: req.projectId,
                      payload: req.payload,
                    },
                    { dedupeKey: `notifications:create:${req.idempotencyKey}:${req.userId}` },
                  ),
                ),
                { concurrency: "unbounded" },
              ),
              fanOutSlackRoutes(result.requests, publisher),
            ],
            { concurrency: "unbounded" },
          ).pipe(Effect.asVoid)
        }),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`notifications.request-wrapped failed wrappedReportId=${payload.wrappedReportId}`, error),
          ),
        ),
        withPostgres(requestLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),

    "create-notification": (payload) =>
      Effect.gen(function* () {
        const result = yield* createNotificationUseCase({
          organizationId: OrganizationId(payload.organizationId),
          userId: payload.userId as Parameters<typeof createNotificationUseCase>[0]["userId"],
          notificationId: payload.notificationId as Parameters<typeof createNotificationUseCase>[0]["notificationId"],
          kind: payload.kind as Parameters<typeof createNotificationUseCase>[0]["kind"],
          idempotencyKey: payload.idempotencyKey,
          projectId: payload.projectId === null ? null : ProjectId(payload.projectId),
          payload: payload.payload,
        })
        if (!result.notification) {
          logger.info(`notifications.create dedup idempotencyKey=${payload.idempotencyKey} userId=${payload.userId}`)
          return
        }
        if (!result.emailEligible) return

        // Org-level kill switch: if the `email-notifications` flag is off
        // for this org, we never enqueue the email-send task. The in-app
        // row is already written; the bell still works. Flag is checked
        // here (creator step) rather than in the emailer because it's
        // cheaper to skip the publish than to enqueue + ack a no-op.
        const flags = yield* FeatureFlagRepository
        const emailEnabled = yield* flags.isEnabledForOrganization("email-notifications")
        if (!emailEnabled) return

        yield* publisher.publish(
          "notification-email",
          "send",
          {
            organizationId: result.notification.organizationId,
            notificationId: result.notification.id,
          },
          { dedupeKey: `notification-email:send:${result.notification.id}` },
        )
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`notifications.create failed userId=${payload.userId} key=${payload.idempotencyKey}`, error),
          ),
        ),
        withPostgres(createLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),

    "delete-by-project": (payload) =>
      deleteNotificationsByProjectUseCase({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
      }).pipe(
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(`notifications.delete-by-project projectId=${payload.projectId} deleted=${result.deleted}`),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`notifications.delete-by-project failed projectId=${payload.projectId}`, error),
          ),
        ),
        withPostgres(NotificationRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),
  })
}
