import { routeAdmitsPayload, SlackIntegrationRepository } from "@domain/integrations"
import {
  createNotificationUseCase,
  deleteNotificationsByProjectUseCase,
  kindRequiresSeverity,
  NOTIFICATION_KIND_META,
  type NotificationKind,
  requestBillingLimitNotificationsUseCase,
  requestDestinationQuarantinedNotificationsUseCase,
  requestIncidentNotificationsUseCase,
  requestSignalAssignedNotificationsUseCase,
  requestSignalDiscoveredNotificationsUseCase,
  requestSignalRegressedNotificationsUseCase,
  requestWrappedReportNotificationsUseCase,
} from "@domain/notifications"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { NOTIFICATION_GROUP_META, OrganizationId, ProjectId, ScoreId, SignalId, type SqlClient } from "@domain/shared"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  IncidentMonitorReaderLive,
  IncidentRepositoryLive,
  MembershipRepositoryLive,
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SignalRepositoryLive,
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
  IncidentRepositoryLive,
  EvaluationRepositoryLive,
  IncidentMonitorReaderLive,
  SignalRepositoryLive,
  MembershipRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SlackIntegrationRepositoryLive,
  UserRepositoryLive,
)

const createLayer = Layer.mergeAll(NotificationRepositoryLive, ProjectRepositoryLive, UserRepositoryLive)

/**
 * Org-level Slack fan-out runs at the producer step (not per recipient).
 * Slack channel notifications are independent of the per-user create-
 * notification loop above: one Slack message per `(occurrence, route)`
 * regardless of recipient count. Skipped when the org has no active
 * integration, or no routes are configured for the kind's group.
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
  readonly slackEligible?: boolean
}

const fanOutSlackRoutes = (
  requests: readonly ProducerRequest[],
  publisher: QueuePublisherShape,
): Effect.Effect<void, never, SlackIntegrationRepository | SqlClient> =>
  Effect.gen(function* () {
    if (requests.length === 0) return
    const first = requests[0]!
    if (first.slackEligible === false) return

    const repo = yield* SlackIntegrationRepository
    const integration = yield* repo.findActiveByOrganizationId().pipe(Effect.orElseSucceed(() => null))
    if (!integration) return

    const kind = first.kind as NotificationKind
    const group = NOTIFICATION_KIND_META[kind]?.group
    if (!group) return
    // Personal kinds target a single user — never broadcast them to a
    // shared channel, even if a stale route were somehow configured.
    if (!NOTIFICATION_GROUP_META[group].slackRoutable) return
    // Routes can set a minimum severity; payloads below it never reach the
    // channel. For kinds that should carry a severity, a missing one means the
    // source is unjudged and is dropped too.
    const requiresSeverity = kindRequiresSeverity(kind)
    const routes = (integration.routes[group] ?? []).filter((route) =>
      routeAdmitsPayload(route, first.payload, { requiresSeverity }),
    )
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

    "request-signal-assigned-notifications": (payload) =>
      requestSignalAssignedNotificationsUseCase({
        organizationId: OrganizationId(payload.organizationId),
        signalId: SignalId(payload.signalId),
        assigneeId: payload.assigneeId,
        actorUserId: payload.actorUserId,
        assignedAt: payload.assignedAt,
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-signal-assigned skipped signalId=${payload.signalId} reason=${result.reason}`,
            )
            return Effect.void
          }
          // No Slack fan-out: `personal` is not slack-routable.
          return Effect.all(
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
          ).pipe(Effect.asVoid)
        }),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`notifications.request-signal-assigned failed signalId=${payload.signalId}`, error),
          ),
        ),
        withPostgres(requestLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),

    "request-signal-discovered-notifications": (payload) =>
      requestSignalDiscoveredNotificationsUseCase({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
        signalId: SignalId(payload.signalId),
        discoveredAt: payload.discoveredAt,
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-signal-discovered skipped signalId=${payload.signalId} reason=${result.reason}`,
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
            logger.error(`notifications.request-signal-discovered failed signalId=${payload.signalId}`, error),
          ),
        ),
        withPostgres(requestLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),

    "request-signal-regressed-notifications": (payload) =>
      requestSignalRegressedNotificationsUseCase({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
        signalId: SignalId(payload.signalId),
        regressedAt: payload.regressedAt,
        triggerScoreId: ScoreId(payload.triggerScoreId),
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-signal-regressed skipped signalId=${payload.signalId} reason=${result.reason}`,
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
            logger.error(`notifications.request-signal-regressed failed signalId=${payload.signalId}`, error),
          ),
        ),
        withPostgres(requestLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),

    "request-destination-quarantined-notifications": (payload) =>
      requestDestinationQuarantinedNotificationsUseCase({
        organizationId: OrganizationId(payload.organizationId),
        projectId: ProjectId(payload.projectId),
        destinationId: payload.destinationId,
        destinationName: payload.destinationName,
        destinationKind: payload.destinationKind,
        quarantinedAt: payload.quarantinedAt,
        failureMessage: payload.failureMessage,
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-destination-quarantined skipped destinationId=${payload.destinationId} reason=${result.reason}`,
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
            logger.error(
              `notifications.request-destination-quarantined failed destinationId=${payload.destinationId}`,
              error,
            ),
          ),
        ),
        withPostgres(requestLayer, pgClient, OrganizationId(payload.organizationId)),
        Effect.asVoid,
        withTracing,
      ),

    "request-billing-limit-notifications": (payload) =>
      requestBillingLimitNotificationsUseCase({
        organizationId: OrganizationId(payload.organizationId),
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        limitKind: payload.limitKind,
        includedCredits: payload.includedCredits,
        consumedCredits: payload.consumedCredits,
        overageCredits: payload.overageCredits,
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-billing-limit skipped org=${payload.organizationId} reason=${result.reason}`,
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
            logger.error(
              `notifications.request-billing-limit failed org=${payload.organizationId} kind=${payload.limitKind}`,
              error,
            ),
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
