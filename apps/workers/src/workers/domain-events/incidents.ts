import {
  closeIncidentFromSignalEventUseCase,
  createIncidentFromSignalEventUseCase,
  type EntrySignalsSnapshot,
} from "@domain/incidents"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId, SignalId } from "@domain/shared"
import { recomputeSignalLevelUseCase, SessionAbandonmentRepository } from "@domain/signals"
import {
  listAbandonmentIndexBySession,
  ScoreAnalyticsRepositoryLive,
  SessionRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  IncidentRepositoryLive,
  OutboxEventWriterLive,
  ScoreRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient } from "../../clients.ts"

const logger = createLogger("alert-incidents")

interface AlertIncidentsDeps {
  consumer: QueueConsumer
}

const repoLayer = Layer.mergeAll(
  IncidentRepositoryLive,
  OutboxEventWriterLive,
  SignalRepositoryLive,
  ScoreRepositoryLive,
)
const analyticsLayer = Layer.mergeAll(
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  SessionRepositoryLive,
  Layer.succeed(SessionAbandonmentRepository, { listAbandonmentIndexBySession }),
)

const createIncidentForSignalEscalation = (payload: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly occurredAt: Date
  readonly entrySignals?: EntrySignalsSnapshot | null
}) =>
  Effect.gen(function* () {
    // Re-level the signal BEFORE opening the incident, so the incident carries
    // the raised level and the ordinary severity threshold decides delivery.
    // Escalation gets no exemption from that threshold: it earns a higher level
    // instead, which keeps one rule — below your minimum stays quiet.
    const recomputed = yield* recomputeSignalLevelUseCase({
      organizationId: OrganizationId(payload.organizationId),
      projectId: ProjectId(payload.projectId),
      signalId: SignalId(payload.signalId),
      escalating: true,
    }).pipe(
      withClickHouse(analyticsLayer, getClickhouseClient(), OrganizationId(payload.organizationId)),
      // A ClickHouse hiccup must not stop an incident opening; the signal keeps
      // whatever level it had and the threshold still applies to that.
      Effect.catchCause(() => Effect.succeed({ status: "skipped" as const, reason: "signal-not-found" as const })),
    )
    const level = recomputed.status === "skipped" ? null : recomputed.level

    return yield* createIncidentFromSignalEventUseCase({
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      signalId: payload.signalId,
      occurredAt: payload.occurredAt,
      entrySignals: payload.entrySignals ?? null,
      ...(level ? { severity: level } : {}),
    })
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
  Effect.gen(function* () {
    const closed = yield* closeIncidentFromSignalEventUseCase({
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      signalId: payload.signalId,
      endedAt: payload.endedAt,
      ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
    })

    // The level comes back down with the rate. Without this the escalation tier
    // latches and every signal that ever spiked keeps claiming to be urgent,
    // which sorts nothing.
    yield* recomputeSignalLevelUseCase({
      organizationId: OrganizationId(payload.organizationId),
      projectId: ProjectId(payload.projectId),
      signalId: SignalId(payload.signalId),
      escalating: false,
    }).pipe(
      withClickHouse(analyticsLayer, getClickhouseClient(), OrganizationId(payload.organizationId)),
      Effect.catchCause(() => Effect.void),
    )

    return closed
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
