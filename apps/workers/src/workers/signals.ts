import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  provideAIMeteringScope,
} from "@domain/billing"
import {
  type QueueConsumer,
  QueuePublisher,
  type QueuePublisherShape,
  WorkflowStarter,
  type WorkflowStarterShape,
} from "@domain/queue"
import type { ScoreSourceType } from "@domain/scores"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  checkSignalEscalationUseCase,
  type DiscoverSignalResult,
  discoverSignalUseCase,
  refreshSignalDetailsUseCase,
  removeScoreFromSignalUseCase,
  sweepEscalatingSignalsUseCase,
} from "@domain/signals"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { RedisBillingSpendReservationLive, type RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { ScoreAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  EvaluationRepositoryLive,
  IncidentRepositoryLive,
  MonitorRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SignalRepositoryLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("issues")

const formatDiscoveryOutcome = (outcome: DiscoverSignalResult) => {
  switch (outcome.action) {
    case "workflow-started":
      return `${outcome.action}:${outcome.workflow}`
    case "skipped":
      return `${outcome.action}:${outcome.reason}`
    case "already-assigned":
      return `${outcome.action}:${outcome.signalId}`
  }
}

interface SignalsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  workflowStarter: WorkflowStarterShape
  postgresClient?: PostgresClient
  /**
   * Admin Postgres client — used by the `sweepEscalating` handler to read
   * `alert_incidents` across orgs (RLS bypass). All other handlers stay on
   * the org-scoped `postgresClient`.
   */
  adminPostgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
}

export const createSignalsWorker = async ({
  consumer,
  publisher,
  workflowStarter,
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
  redisClient,
}: SignalsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const adminPgClient = adminPostgresClient ?? getAdminPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()

  consumer.subscribe("issues", {
    discovery: (payload) =>
      discoverSignalUseCase(payload).pipe(
        Effect.tap((outcome) =>
          Effect.sync(() => {
            logger.info(
              `Processed signal discovery for ${payload.projectId}/${payload.scoreId} (${formatDiscoveryOutcome(outcome)})`,
            )
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Signal discovery failed for ${payload.projectId}/${payload.scoreId}`, error)),
        ),
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, SignalRepositoryLive, OutboxEventWriterLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        withAi(AIEmbedLive, rdClient),
        withTracing,
        Effect.provide(Layer.succeed(WorkflowStarter, workflowStarter)),
        Effect.asVoid,
      ),
    refresh: (payload) =>
      Effect.gen(function* () {
        const organizationId = OrganizationId(payload.organizationId)

        // No stable per-refresh identity exists in the payload; the random suffix
        // makes each refresh bill separately, while a retried job's generate hits
        // the 24h AI cache and is never re-charged.
        const keyParts = ["signal-refresh", payload.signalId, crypto.randomUUID()]
        const authorization = yield* authorizeBillableAction({
          organizationId,
          action: "llm-call",
          skipIfBlocked: true,
          idempotencyKey: buildBillingIdempotencyKey("llm-call", [payload.organizationId, ...keyParts, "authorize"]),
        })
        if (!authorization.allowed) {
          logger.info(`Signal refresh skipped for ${payload.projectId}/${payload.signalId} — billing blocked`)
          return
        }
        const meteringScope = yield* makeAIMeteringScope({
          organizationId,
          projectId: ProjectId(payload.projectId),
          keyParts,
          context: authorization.context,
        })
        return yield* refreshSignalDetailsUseCase(payload).pipe(provideAIMeteringScope(meteringScope))
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            EvaluationRepositoryLive,
            SignalRepositoryLive,
            ScoreRepositoryLive,
            BillingOverrideRepositoryLive,
            BillingUsageEventRepositoryLive,
            BillingUsagePeriodRepositoryLive,
            OutboxEventWriterLive,
            SettingsReaderLive,
            StripeSubscriptionLookupLive,
          ),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        Effect.provide(RedisBillingSpendReservationLive(rdClient)),
        withAi(AIGenerateLive, rdClient),
        withTracing,
        Effect.provide(Layer.succeed(QueuePublisher, publisher)),
        Effect.tap(() =>
          Effect.sync(() => logger.info(`Refreshed signal details for ${payload.projectId}/${payload.signalId}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Signal refresh failed for ${payload.projectId}/${payload.signalId}`, error)),
        ),
        Effect.asVoid,
      ),
    // Evaluate escalation state from the analytics aggregate + the current
    // `alert_incidents`-derived `lifecycle.isEscalating` flag, and emit the
    // matching transition event. The use case does not write the signal —
    // the open/closed `alert_incidents` row is the stored truth. The
    // alert-incidents worker inserts/closes that row in response to
    // `SignalEscalated` / `SignalEscalationEnded`. Triggered by two paths:
    // the throttled `issues:check-escalation` publish from
    // `ScoreAssignedToSignal` (entry + active-burst exit detection), and the
    // hourly `sweepEscalating` cron below (exit detection on quiet issues
    // plus cold-start recovery for already-stuck rows).
    checkEscalation: (payload) =>
      checkSignalEscalationUseCase(payload).pipe(
        withPostgres(
          Layer.mergeAll(
            SignalRepositoryLive,
            OutboxEventWriterLive,
            IncidentRepositoryLive,
            SettingsReaderLive,
            MonitorRepositoryLive,
          ),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, OrganizationId(payload.organizationId)),
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              `Escalation check for ${payload.projectId}/${payload.signalId}: transition=${result.transition} currentlyEscalating=${result.currentlyEscalating}`,
            ),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`Escalation check failed for ${payload.projectId}/${payload.signalId}`, error),
          ),
        ),
        withTracing,
        Effect.asVoid,
      ),
    // Fired by the hourly cron. Reads every open signal escalation row
    // (across orgs, via admin Postgres) and enqueues one `checkEscalation`
    // per incident. Separate dedupeKey from the throttled publish so a
    // pending throttled job's jobId doesn't shadow the sweep publish — the
    // BullMQ dedup uses dedupeKey as the jobId.
    sweepEscalating: () =>
      sweepEscalatingSignalsUseCase({
        publish: (payload) =>
          publisher.publish("issues", "checkEscalation", payload, {
            dedupeKey: `issues:check-escalation-sweep:${payload.signalId}`,
          }),
      }).pipe(
        withPostgres(IncidentRepositoryLive, adminPgClient),
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(
              `Escalation sweep: published=${result.published} failed=${result.failed} attempted=${result.attempted}`,
            ),
          ),
        ),
        Effect.tapError((error) => Effect.sync(() => logger.error("Escalation sweep failed", error))),
        withTracing,
        Effect.asVoid,
      ),
    removeScore: (payload) =>
      removeScoreFromSignalUseCase({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        signalId: payload.signalId,
        draftedAt: payload.draftedAt ? new Date(payload.draftedAt) : null,
        feedback: payload.feedback,
        sourceType: payload.source as ScoreSourceType,
        createdAt: new Date(payload.createdAt),
      }).pipe(
        withPostgres(SignalRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        withAi(AIEmbedLive, rdClient),
        withTracing,
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "removed") {
              logger.info(
                `Removed score contribution from signal centroid for ${payload.projectId}/${payload.signalId}`,
              )
            } else if (result.action === "issue-not-found") {
              logger.info(`Signal ${payload.signalId} not found when removing score contribution`)
            }
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`Failed to remove score from issue ${payload.projectId}/${payload.signalId}`, error),
          ),
        ),
        Effect.asVoid,
      ),
  })
}
