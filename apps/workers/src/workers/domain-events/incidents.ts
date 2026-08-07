import {
  closeIncidentFromSignalEventUseCase,
  createIncidentFromSignalEventUseCase,
  type EntrySignalsSnapshot,
} from "@domain/incidents"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { IncidentRepositoryLive, OutboxEventWriterLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../../clients.ts"

const logger = createLogger("alert-incidents")

interface AlertIncidentsDeps {
  consumer: QueueConsumer
}

const repoLayer = Layer.mergeAll(IncidentRepositoryLive, OutboxEventWriterLive)

const createIncidentForSignalEscalation = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly occurredAt: Date
  readonly entrySignals?: EntrySignalsSnapshot | null
}) =>
  createIncidentFromSignalEventUseCase({
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    signalId: payload.signalId,
    occurredAt: payload.occurredAt,
    entrySignals: payload.entrySignals ?? null,
  }).pipe(
    withPostgres(repoLayer, getPostgresClient(), OrganizationId(payload.organizationId)),
    Effect.tap((incident) =>
      Effect.sync(() => logger.info(`alert_incident created signalId=${payload.signalId} id=${incident.id}`)),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => logger.error(`alert_incident creation failed signalId=${payload.signalId}`, error)),
    ),
    Effect.asVoid,
    withTracing,
  )

const closeIncidentForSignalEscalation = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly endedAt: Date
  readonly reason?: "threshold" | "absolute-rate-drop" | "timeout" | "resolved" | "ignored"
}) =>
  closeIncidentFromSignalEventUseCase({
    organizationId: payload.organizationId,
    projectId: payload.projectId,
    signalId: payload.signalId,
    endedAt: payload.endedAt,
    ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
  }).pipe(
    withPostgres(repoLayer, getPostgresClient(), OrganizationId(payload.organizationId)),
    Effect.tap(() => Effect.sync(() => logger.info(`alert_incident closed signalId=${payload.signalId}`))),
    Effect.tapError((error) =>
      Effect.sync(() => logger.error(`alert_incident close failed signalId=${payload.signalId}`, error)),
    ),
    Effect.asVoid,
    withTracing,
  )

export const createIncidentsWorker = ({ consumer }: AlertIncidentsDeps) => {
  consumer.subscribe("alert-incidents", {
    "signal-escalated": (payload) =>
      createIncidentForSignalEscalation({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        occurredAt: new Date(payload.escalatedAt),
        entrySignals: payload.entrySignals,
      }),

    "signal-escalation-ended": (payload) =>
      closeIncidentForSignalEscalation({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        endedAt: new Date(payload.endedAt),
        reason: payload.reason,
      }),
  })
}
