import { EMAIL_NOTIFICATIONS_FLAG, FeatureFlagRepository } from "@domain/feature-flags"
import {
  createNotificationUseCase,
  deleteNotificationsByProjectUseCase,
  requestIncidentNotificationsUseCase,
  requestWrappedReportNotificationsUseCase,
} from "@domain/notifications"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  AlertIncidentRepositoryLive,
  FeatureFlagRepositoryLive,
  IssueRepositoryLive,
  MembershipRepositoryLive,
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  SettingsReaderLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("notifications")

interface NotificationsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
}

const requestLayer = Layer.mergeAll(
  AlertIncidentRepositoryLive,
  IssueRepositoryLive,
  MembershipRepositoryLive,
  ProjectRepositoryLive,
  SettingsReaderLive,
)

const createLayer = Layer.mergeAll(FeatureFlagRepositoryLive, NotificationRepositoryLive, UserRepositoryLive)

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

  consumer.subscribe("notifications", {
    "request-incident-notifications": (payload) =>
      requestIncidentNotificationsUseCase({
        alertIncidentId: payload.alertIncidentId,
        kind: payload.kind,
      }).pipe(
        Effect.flatMap((result) => {
          if (result.status === "skipped") {
            logger.info(
              `notifications.request-incident skipped alertIncidentId=${payload.alertIncidentId} reason=${result.reason}`,
            )
            return Effect.void
          }
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
            logger.error(`notifications.request-incident failed alertIncidentId=${payload.alertIncidentId}`, error),
          ),
        ),
        withPostgres(requestLayer, pgClient, OrganizationId(payload.organizationId)),
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
        const emailEnabled = yield* flags.isEnabledForOrganization(EMAIL_NOTIFICATIONS_FLAG)
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
