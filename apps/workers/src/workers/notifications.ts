import { createIncidentNotificationsUseCase, createWrappedReportNotificationsUseCase } from "@domain/notifications"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import {
  AlertIncidentRepositoryLive,
  IssueRepositoryLive,
  MembershipRepositoryLive,
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  SettingsReaderLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("notifications")

interface NotificationsDeps {
  consumer: QueueConsumer
}

const repoLayer = Layer.mergeAll(
  AlertIncidentRepositoryLive,
  IssueRepositoryLive,
  MembershipRepositoryLive,
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  SettingsReaderLive,
)

const handleIncident = (input: { alertIncidentId: string; event: "opened" | "closed"; organizationId: string }) => {
  const pgClient = getPostgresClient()

  return createIncidentNotificationsUseCase({
    alertIncidentId: input.alertIncidentId,
    event: input.event,
  }).pipe(
    withPostgres(repoLayer, pgClient, OrganizationId(input.organizationId)),
    Effect.tap((result) =>
      Effect.sync(() =>
        logger.info(
          `notifications.${input.event} alertIncidentId=${input.alertIncidentId} inserted=${result.inserted} skipped=${result.skipped}`,
        ),
      ),
    ),
    Effect.tapError((error) =>
      Effect.sync(() =>
        logger.error(`notifications.${input.event} failed alertIncidentId=${input.alertIncidentId}`, error),
      ),
    ),
    Effect.asVoid,
    withTracing,
  )
}

const handleWrappedReport = (input: {
  organizationId: string
  wrappedReportId: string
  projectName: string
  link: string
}) => {
  const pgClient = getPostgresClient()

  return createWrappedReportNotificationsUseCase({
    organizationId: OrganizationId(input.organizationId),
    wrappedReportId: input.wrappedReportId,
    projectName: input.projectName,
    link: input.link,
  }).pipe(
    withPostgres(repoLayer, pgClient, OrganizationId(input.organizationId)),
    Effect.tap((result) =>
      Effect.sync(() =>
        logger.info(`notifications.wrapped wrappedReportId=${input.wrappedReportId} inserted=${result.inserted}`),
      ),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => logger.error(`notifications.wrapped failed wrappedReportId=${input.wrappedReportId}`, error)),
    ),
    Effect.asVoid,
    withTracing,
  )
}

export const createNotificationsWorker = ({ consumer }: NotificationsDeps) => {
  consumer.subscribe("notifications", {
    "create-from-incident-opened": (payload) =>
      handleIncident({
        alertIncidentId: payload.alertIncidentId,
        event: "opened",
        organizationId: payload.organizationId,
      }),
    "create-from-incident-closed": (payload) =>
      handleIncident({
        alertIncidentId: payload.alertIncidentId,
        event: "closed",
        organizationId: payload.organizationId,
      }),
    "create-from-wrapped-report": (payload) =>
      handleWrappedReport({
        organizationId: payload.organizationId,
        wrappedReportId: payload.wrappedReportId,
        projectName: payload.projectName,
        link: payload.link,
      }),
  })
}
