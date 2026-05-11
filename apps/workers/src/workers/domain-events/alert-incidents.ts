import {
  type AlertIncidentKind,
  closeAlertIncidentFromIssueEventUseCase,
  createAlertIncidentFromIssueEventUseCase,
  type EntrySignalsSnapshot,
} from "@domain/alerts"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { AlertIncidentRepositoryLive, OutboxEventWriterLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../../clients.ts"

const logger = createLogger("alert-incidents")

interface AlertIncidentsDeps {
  consumer: QueueConsumer
}

const repoLayer = Layer.mergeAll(AlertIncidentRepositoryLive, OutboxEventWriterLive)

const createIncidentFor = (
  kind: AlertIncidentKind,
  payload: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly occurredAt: Date
    readonly entrySignals?: EntrySignalsSnapshot | null
  },
) => {
  const pgClient = getPostgresClient()

  return createAlertIncidentFromIssueEventUseCase({
    kind,
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    issueId: payload.issueId,
    occurredAt: payload.occurredAt,
    entrySignals: payload.entrySignals ?? null,
  }).pipe(
    withPostgres(repoLayer, pgClient, OrganizationId(payload.organizationId)),
    Effect.tap((incident) =>
      Effect.sync(() =>
        logger.info(`alert_incident created kind=${incident.kind} issueId=${payload.issueId} id=${incident.id}`),
      ),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => logger.error(`alert_incident creation failed kind=${kind} issueId=${payload.issueId}`, error)),
    ),
    Effect.asVoid,
    withTracing,
  )
}

const closeIncidentFor = (
  kind: "issue.escalating",
  payload: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly endedAt: Date
    readonly reason?: "threshold" | "absolute-rate-drop" | "timeout"
  },
) => {
  const pgClient = getPostgresClient()

  return closeAlertIncidentFromIssueEventUseCase({
    kind,
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    issueId: payload.issueId,
    endedAt: payload.endedAt,
    // Omit when undefined: `exactOptionalPropertyTypes` rejects
    // `{ reason: undefined }` against the optional `reason?:` field.
    ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
  }).pipe(
    withPostgres(repoLayer, pgClient, OrganizationId(payload.organizationId)),
    Effect.tap(() => Effect.sync(() => logger.info(`alert_incident closed kind=${kind} issueId=${payload.issueId}`))),
    Effect.tapError((error) =>
      Effect.sync(() => logger.error(`alert_incident close failed kind=${kind} issueId=${payload.issueId}`, error)),
    ),
    Effect.asVoid,
    withTracing,
  )
}

export const createAlertIncidentsWorker = ({ consumer }: AlertIncidentsDeps) => {
  consumer.subscribe("alert-incidents", {
    "issue-created": (payload) =>
      createIncidentFor("issue.new", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        issueId: payload.issueId,
        occurredAt: new Date(payload.createdAt),
      }),

    "issue-regressed": (payload) =>
      createIncidentFor("issue.regressed", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        issueId: payload.issueId,
        occurredAt: new Date(payload.regressedAt),
      }),

    "issue-escalated": (payload) =>
      createIncidentFor("issue.escalating", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        issueId: payload.issueId,
        occurredAt: new Date(payload.escalatedAt),
        entrySignals: payload.entrySignals,
      }),

    "issue-escalation-ended": (payload) =>
      closeIncidentFor("issue.escalating", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        issueId: payload.issueId,
        endedAt: new Date(payload.endedAt),
        reason: payload.reason,
      }),
  })
}
