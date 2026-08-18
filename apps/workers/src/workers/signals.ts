import { ApiKeyRepository } from "@domain/api-keys"
import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  provideAIMeteringScope,
} from "@domain/billing"
import { recordSignalFlaggerReviewUseCase } from "@domain/product-feedback"
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
  promoteSignalUseCase,
  refreshSignalDetailsUseCase,
  removeScoreFromSignalUseCase,
  reviewSignalFlaggerOccurrencesUseCase,
  sweepEscalatingSignalsUseCase,
} from "@domain/signals"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import { RedisBillingSpendReservationLive, type RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  ApiKeyRepositoryLive,
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  EvaluationRepositoryLive,
  IncidentRepositoryLive,
  MonitorRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SettingsReaderLive,
  SignalRepositoryLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnvOptional } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { hash } from "@repo/utils"
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
    // Turn a qualified signal into a promoted one: name it from its cluster,
    // stamp `promoted_at`, emit `SignalPromoted`. The announcements hang off
    // that event, so nothing is published from here.
    //
    // Billing blocking must not block promotion. The authorization only decides
    // whether a model call is affordable, and `promoteSignalUseCase` already
    // promotes under the placeholder when generation yields nothing — a signal
    // held back because an organization ran out of credits would stay invisible
    // with nothing scheduled to retry it.
    promoteSignal: (payload) =>
      Effect.gen(function* () {
        const organizationId = OrganizationId(payload.organizationId)
        const keyParts = ["signal-promotion", payload.signalId]
        const authorization = yield* authorizeBillableAction({
          organizationId,
          action: "llm-call",
          skipIfBlocked: true,
          idempotencyKey: buildBillingIdempotencyKey("llm-call", [payload.organizationId, ...keyParts, "authorize"]),
        }).pipe(Effect.catch(() => Effect.succeed(null)))

        const meteringScope =
          authorization?.allowed === true
            ? yield* makeAIMeteringScope({
                organizationId,
                projectId: ProjectId(payload.projectId),
                keyParts,
                context: authorization.context,
              }).pipe(Effect.catch(() => Effect.succeed(null)))
            : null

        if (meteringScope === null) {
          logger.info(
            `Promoting ${payload.projectId}/${payload.signalId} without a generated name — AI unavailable or billing blocked`,
          )
        }

        return yield* promoteSignalUseCase({
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          signalId: payload.signalId,
        }).pipe(meteringScope === null ? (effect) => effect : provideAIMeteringScope(meteringScope))
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
        Effect.tap((result) =>
          Effect.sync(() => logger.info(`Promotion for ${payload.projectId}/${payload.signalId}: ${result.action}`)),
        ),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Promotion failed for ${payload.projectId}/${payload.signalId}`, error)),
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
    // Selection half of the signal-feedback fan-out: the customer's verdict on a
    // signal becomes one grading job per flagger generation that detected it.
    reviewFlaggerOccurrences: (payload) =>
      reviewSignalFlaggerOccurrencesUseCase(payload).pipe(
        withPostgres(
          Layer.mergeAll(SignalRepositoryLive, ScoreRepositoryLive),
          pgClient,
          OrganizationId(payload.organizationId),
        ),
        Effect.provide(Layer.succeed(QueuePublisher, publisher)),
        Effect.tap((result) =>
          Effect.sync(() => {
            if (result.action === "skipped") {
              logger.info(`Feedback review skipped for ${payload.projectId}/${payload.signalId}: ${result.reason}`)
              return
            }
            logger.info(
              `Feedback review for ${payload.projectId}/${payload.signalId}: scanned=${result.scanned} flaggerRows=${result.flaggerRows} withoutFlaggerTrace=${result.withoutFlaggerTrace} published=${result.published}`,
            )
          }),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`Feedback review fan-out failed for ${payload.projectId}/${payload.signalId}`, error),
          ),
        ),
        withTracing,
        Effect.asVoid,
      ),
    // Writes the verdict onto Latitude's own flagger trace, under a scope pinned
    // to the dogfood organization. The customer's project is never written to.
    reviewFlaggerOccurrence: (payload) =>
      Effect.gen(function* () {
        // The telemetry credential is the only permitted source of the dogfood
        // organization: resolving `latitude-flaggers` by slug across organizations
        // could match a customer project of the same name. Deployments that do not
        // dogfood (self-hosted, local dev, CI) carry no key and skip.
        const telemetryApiKey = yield* parseEnvOptional("LAT_LATITUDE_TELEMETRY_API_KEY", "string")
        if (!telemetryApiKey) {
          yield* Effect.sync(() =>
            logger.info(`Flagger review skipped for ${payload.signalId} — no telemetry API key configured`),
          )
          return
        }

        const apiKeyRepository = yield* ApiKeyRepository
        const key = yield* apiKeyRepository.findByTokenHash(yield* hash(telemetryApiKey))
        const dogfoodOrganizationId = key.organizationId

        const result = yield* recordSignalFlaggerReviewUseCase({
          organizationId: dogfoodOrganizationId,
          signalId: payload.signalId,
          flaggerSlug: payload.flaggerSlug,
          flaggerTraceId: payload.flaggerTraceId,
          value: payload.value,
          passed: payload.passed,
          feedback: payload.feedback,
        }).pipe(
          withPostgres(
            Layer.mergeAll(ProjectRepositoryLive, ScoreRepositoryLive, OutboxEventWriterLive),
            pgClient,
            OrganizationId(dogfoodOrganizationId),
          ),
          withClickHouse(
            Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive, ScoreAnalyticsRepositoryLive),
            chClient,
            OrganizationId(dogfoodOrganizationId),
          ),
        )

        yield* Effect.sync(() =>
          logger.info(
            `Flagger review for ${payload.signalId}/${payload.flaggerSlug} on ${payload.flaggerTraceId}: ${result.action === "written" ? `written:${result.scoreId}` : `skipped:${result.reason}`}`,
          ),
        )
      }).pipe(
        // Cross-organization lookup: the key names its own tenant, so it runs on the
        // admin client with no organization scope to resolve.
        withPostgres(ApiKeyRepositoryLive, adminPgClient),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`Flagger review failed for ${payload.signalId} on ${payload.flaggerTraceId}`, error),
          ),
        ),
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
