import {
  type AlertIncidentKind,
  closeAlertIncidentFromSignalEventUseCase,
  createAlertIncidentFromSignalEventUseCase,
  type EntrySignalsSnapshot,
} from "@domain/alerts"
import { resolveMonitorAlertsForSourceEventUseCase } from "@domain/monitors"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  AlertIncidentRepositoryLive,
  MonitorRepositoryLive,
  OutboxEventWriterLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../../clients.ts"

const logger = createLogger("alert-incidents")

interface AlertIncidentsDeps {
  consumer: QueueConsumer
}

const repoLayer = Layer.mergeAll(AlertIncidentRepositoryLive, MonitorRepositoryLive, OutboxEventWriterLive)

const createIncidentFor = (
  kind: AlertIncidentKind,
  payload: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly occurredAt: Date
    readonly entrySignals?: EntrySignalsSnapshot | null
  },
) => {
  const pgClient = getPostgresClient()

  return Effect.gen(function* () {
    const alerts = yield* resolveMonitorAlertsForSourceEventUseCase({
      projectId: ProjectId(payload.projectId),
      kind,
      sourceId: payload.signalId,
    })

    // One incident per matching alert. No match (for example, a project predating
    // system monitors) falls back to a single legacy incident, preserving old behaviour.
    const targets =
      alerts.length > 0
        ? alerts.map((alert) => ({ monitorAlertId: alert.id, condition: alert.condition }))
        : [{ monitorAlertId: null, condition: null }]

    for (const target of targets) {
      const incident = yield* createAlertIncidentFromSignalEventUseCase({
        kind,
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        occurredAt: payload.occurredAt,
        entrySignals: payload.entrySignals ?? null,
        monitorAlertId: target.monitorAlertId,
        condition: target.condition,
      })
      yield* Effect.sync(() =>
        logger.info(
          `alert_incident created kind=${incident.kind} signalId=${payload.signalId} id=${incident.id} monitorAlertId=${target.monitorAlertId ?? "none"}`,
        ),
      )
    }
  }).pipe(
    withPostgres(repoLayer, pgClient, OrganizationId(payload.organizationId)),
    Effect.tapError((error) =>
      Effect.sync(() =>
        logger.error(`alert_incident creation failed kind=${kind} signalId=${payload.signalId}`, error),
      ),
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
    readonly signalId: string
    readonly endedAt: Date
    readonly reason?: "threshold" | "absolute-rate-drop" | "timeout" | "resolved" | "ignored"
  },
) => {
  const pgClient = getPostgresClient()

  return closeAlertIncidentFromSignalEventUseCase({
    kind,
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    signalId: payload.signalId,
    endedAt: payload.endedAt,
    // Omit when undefined: `exactOptionalPropertyTypes` rejects
    // `{ reason: undefined }` against the optional `reason?:` field.
    ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
  }).pipe(
    withPostgres(repoLayer, pgClient, OrganizationId(payload.organizationId)),
    Effect.tap(() => Effect.sync(() => logger.info(`alert_incident closed kind=${kind} signalId=${payload.signalId}`))),
    Effect.tapError((error) =>
      Effect.sync(() => logger.error(`alert_incident close failed kind=${kind} signalId=${payload.signalId}`, error)),
    ),
    Effect.asVoid,
    withTracing,
  )
}

export const createAlertIncidentsWorker = ({ consumer }: AlertIncidentsDeps) => {
  consumer.subscribe("alert-incidents", {
    "signal-created": (payload) =>
      createIncidentFor("issue.new", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        occurredAt: new Date(payload.createdAt),
      }),

    "signal-regressed": (payload) =>
      createIncidentFor("issue.regressed", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        occurredAt: new Date(payload.regressedAt),
      }),

    "signal-escalated": (payload) =>
      createIncidentFor("issue.escalating", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        occurredAt: new Date(payload.escalatedAt),
        entrySignals: payload.entrySignals,
      }),

    "signal-escalation-ended": (payload) =>
      closeIncidentFor("issue.escalating", {
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        endedAt: new Date(payload.endedAt),
        reason: payload.reason,
      }),
  })
}
