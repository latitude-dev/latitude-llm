import { PLAN_CONFIGS } from "@domain/billing"
import {
  type BackfillWindowJob,
  backfillDestinationUseCase,
  createPosthogMapper,
  DESTINATION_SYNC_MAX_ATTEMPTS,
  DESTINATION_SYNC_RETRY_BACKOFF_MS,
  type DestinationDelivererRegistry,
  DestinationDeliverers,
  type DestinationMapperRegistry,
  DestinationMappers,
  type DestinationQuarantineEvent,
  DestinationRetentionPolicy,
  type DestinationSource,
  DestinationSourceStateRepository,
  deleteProjectDestinationsUseCase,
  pruneDestinationSyncRunsUseCase,
  recordBackfillFailureUseCase,
  recordDestinationSyncFailureUseCase,
  runBackfillWindowUseCase,
  runDestinationSyncUseCase,
  SpansSourceReadersLive,
  sweepDestinationsUseCase,
} from "@domain/destinations"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { DestinationId, OrganizationId, ProjectId } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import { createPosthogDeliverer, POSTHOG_EVENT_MAX_BYTES } from "@platform/data-destinations"
import { type ClickHouseClient, SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  BillingOverrideRepositoryLive,
  DestinationRepositoryLive,
  DestinationSourceStateRepositoryLive,
  DestinationSyncRunRepositoryLive,
  OrganizationRepositoryLive,
  type PostgresClient,
  ProjectRepositoryLive,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("destinations")

/** Backfill runs in its own capped lane (separate queue) so it can't starve live sync. K of the worker's slots, at most. */
const DESTINATION_BACKFILL_CONCURRENCY = 3

interface DestinationsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  redisClient: RedisClient
  postgresClient?: PostgresClient
  adminPostgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Widest plan retention — the over-reach fallback if billing is momentarily unresolvable. */
const MAX_RETENTION_MS = Math.max(...Object.values(PLAN_CONFIGS).map((p) => p.retentionDays)) * DAY_MS
const billingPlanLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  OrganizationRepositoryLive,
)

const deleteByProjectLayer = Layer.mergeAll(
  DestinationRepositoryLive,
  DestinationSourceStateRepositoryLive,
  DestinationSyncRunRepositoryLive,
)
const runSyncLayer = Layer.mergeAll(
  DestinationRepositoryLive,
  DestinationSourceStateRepositoryLive,
  DestinationSyncRunRepositoryLive,
  ProjectRepositoryLive,
)
const recordFailureLayer = Layer.mergeAll(DestinationRepositoryLive, DestinationSourceStateRepositoryLive)
const backfillLayer = Layer.mergeAll(DestinationRepositoryLive, DestinationSourceStateRepositoryLive)
const backfillFailureLayer = Layer.mergeAll(DestinationSyncRunRepositoryLive, DestinationSourceStateRepositoryLive)

/** v1 source-reader registry: the domain spans binding backed by the ClickHouse SpanRepository. */
const sourceReadersLive = SpansSourceReadersLive.pipe(Layer.provide(SpanRepositoryLive))

const resolveWebUrl = () =>
  Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000")).replace(/\/$/, "")

/**
 * Dev/QA-only override of the window-end safety lag (ms). Ignored in production —
 * there the 5-minute default is load-bearing for the at-least-once guarantee
 * (it must cover ingest-queue + merge settling). Locally a small value (e.g. 30s)
 * makes freshly-seeded spans eligible in ~1 min instead of ~6.
 */
const resolveDevSafetyLagMs = (): number | undefined => {
  const isProduction = Effect.runSync(parseEnv("NODE_ENV", "string", "development")) === "production"
  if (isProduction) return undefined
  return Effect.runSync(parseEnvOptional("LAT_DEV_DESTINATIONS_SAFETY_LAG_MS", "number"))
}

/** Best-effort cross-link back into Latitude; the project slug is the run's anchor (falls back to project id). */
const spanUrlBuilder =
  (webUrl: string, projectSlug: string) =>
  (span: SpanDetail): string =>
    `${webUrl}/projects/${projectSlug}?traceId=${encodeURIComponent(span.traceId)}&spanId=${encodeURIComponent(span.spanId)}`

/** Sanitized to status + our taxonomy; delivery errors never carry upstream response bodies. */
const finalFailureMessage = (error: Error): string => {
  const e = error as { reason?: unknown; upstreamStatus?: unknown }
  if (typeof e.reason === "string") {
    return typeof e.upstreamStatus === "number" ? `[${e.upstreamStatus}] ${e.reason}` : e.reason
  }
  return "delivery retries exhausted"
}

export const createDestinationsWorker = ({
  consumer,
  publisher,
  redisClient,
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
}: DestinationsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const adminPgClient = adminPostgresClient ?? getAdminPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const webUrl = resolveWebUrl()
  const devSafetyLagMs = resolveDevSafetyLagMs()

  // Billing-aware retention adapter for the backfill service: resolves the org's
  // subscription retention window, self-contained (provides its own pg + cache),
  // falling back to the widest plan retention if billing is momentarily down.
  const retentionPolicyLayer = Layer.succeed(DestinationRetentionPolicy, {
    maxAgeMs: (organizationId: OrganizationId) =>
      resolveEffectivePlanCached(organizationId).pipe(
        Effect.map((plan) => plan.plan.retentionDays * DAY_MS),
        withPostgres(billingPlanLayers, pgClient, organizationId),
        Effect.provide(RedisCacheStoreLive(redisClient)),
        Effect.orElseSucceed(() => MAX_RETENTION_MS),
      ),
  })

  // Kind-stable, built once; the mapper is built per-run because its span-URL
  // builder depends on the run's project slug.
  const delivererRegistry: DestinationDelivererRegistry = {
    posthog: createPosthogDeliverer(),
  }

  /**
   * Best-effort fan-out of the customer-facing quarantine notification. Fired
   * exactly once per quarantine episode (the use case only emits the event on
   * the active→quarantined transition; later failures skip). Publish failure is
   * logged, not propagated — a lost notification must not re-fail the sync job.
   */
  const publishQuarantineNotification = (event: DestinationQuarantineEvent) =>
    publisher
      .publish(
        "notifications",
        "request-destination-quarantined-notifications",
        {
          organizationId: event.organizationId,
          projectId: event.projectId,
          destinationId: event.destinationId,
          destinationName: event.destinationName,
          destinationKind: event.destinationKind,
          quarantinedAt: event.quarantinedAt.toISOString(),
          failureMessage: event.failureMessage,
        },
        {
          dedupeKey: `notifications:request-destination-quarantined:${event.destinationId}:${event.quarantinedAt.toISOString()}`,
        },
      )
      .pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(
              `destinations.quarantine notification publish failed destinationId=${event.destinationId}`,
              error,
            ),
          ),
        ),
        Effect.orElseSucceed(() => undefined),
      )

  const makeMapperRegistry = (projectSlug: string): DestinationMapperRegistry => ({
    posthog: {
      spans: createPosthogMapper({
        buildSpanUrl: spanUrlBuilder(webUrl, projectSlug),
        maxEventBytes: POSTHOG_EVENT_MAX_BYTES,
      }),
    },
  })

  const loadProjectSlug = (projectId: string) =>
    Effect.gen(function* () {
      const projects = yield* ProjectRepository
      return yield* projects.findById(ProjectId(projectId)).pipe(
        Effect.map((project) => project.slug),
        Effect.orElseSucceed(() => projectId),
      )
    })

  // The backfill chain re-enqueues one window at a time; each is independently
  // retryable and idempotent. No dedupeKey on the chain (a retained jobId would
  // shadow the next window — the documented sweep bug); sequentiality comes from
  // each job enqueueing the next only after it lands.
  const backfillWindowPayload = (
    base: { organizationId: string; projectId: string; destinationId: string; source: DestinationSource },
    job: BackfillWindowJob,
  ) => ({
    ...base,
    cursorWatermark: job.cursor.watermark.toISOString(),
    cursorId: job.cursor.id,
    segmentEnd: job.segmentEnd.toISOString(),
    remainingSegments: job.remainingSegments.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
    })),
    coverageFloor: job.coverageFloor.toISOString(),
  })

  const publishBackfillWindow = (
    base: { organizationId: string; projectId: string; destinationId: string; source: DestinationSource },
    job: BackfillWindowJob,
  ) =>
    publisher.publish("destinations-backfill", "runBackfillWindow", backfillWindowPayload(base, job), {
      attempts: DESTINATION_SYNC_MAX_ATTEMPTS,
      backoff: { type: "exponential", delayMs: DESTINATION_SYNC_RETRY_BACKOFF_MS },
    })

  // A terminally-failed backfill *window* writes a `failed` run row (so the failure
  // shows in run history like a live-sync failure) and clears the in-flight marker.
  // Backfill windows only write a row on success, so without this a dead chain would
  // vanish silently with the marker stuck on.
  const recordBackfillWindowFailure = (
    payload: {
      organizationId: string
      destinationId: string
      source: string
      cursorWatermark: string
      segmentEnd: string
    },
    error: Error,
  ) =>
    recordBackfillFailureUseCase({
      organizationId: OrganizationId(payload.organizationId),
      destinationId: DestinationId(payload.destinationId),
      source: payload.source as DestinationSource,
      windowStart: new Date(payload.cursorWatermark),
      windowEnd: new Date(payload.segmentEnd),
      message: finalFailureMessage(error),
      now: new Date(),
    }).pipe(
      withPostgres(backfillFailureLayer, pgClient, OrganizationId(payload.organizationId)),
      Effect.tap(() =>
        Effect.sync(() =>
          logger.warn(`destinations.runBackfillWindow exhausted retries destinationId=${payload.destinationId}`),
        ),
      ),
      Effect.tapError((failure) =>
        Effect.sync(() =>
          logger.error(`destinations.recordBackfillFailure errored destinationId=${payload.destinationId}`, failure),
        ),
      ),
      withTracing,
      Effect.asVoid,
    )

  // A terminally-failed backfill chain has no completion step to clear its in-flight
  // marker, so clear it here — otherwise the UI shows "backfill in progress" forever.
  const clearBackfillInFlight = (payload: { organizationId: string; destinationId: string; source: string }) =>
    Effect.gen(function* () {
      const repo = yield* DestinationSourceStateRepository
      yield* repo.setBackfillStartedAt({
        destinationId: DestinationId(payload.destinationId),
        source: payload.source as DestinationSource,
        at: null,
      })
    }).pipe(
      withPostgres(DestinationSourceStateRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error(`destinations.clearBackfillInFlight failed destinationId=${payload.destinationId}`, error),
        ),
      ),
      withTracing,
      Effect.asVoid,
    )

  consumer.subscribe(
    "destinations",
    {
      sweep: () =>
        sweepDestinationsUseCase({
          now: new Date(),
          publish: ({ destination, source }) =>
            publisher.publish(
              "destinations",
              "runSync",
              {
                organizationId: destination.organizationId,
                projectId: destination.projectId,
                destinationId: destination.id,
                source,
              },
              {
                // TTL-windowed dedupe (not a bare dedupeKey): a bare key maps to a
                // BullMQ jobId that `removeOnComplete` retains, which would shadow every
                // later publish and make the destination sync exactly once. Leading-edge
                // throttle fires immediately and suppresses re-publishes for one interval.
                dedupeKey: `destinations:runSync:${destination.id}:${source}`,
                leadingThrottleMs: destination.config.intervalMs,
                attempts: DESTINATION_SYNC_MAX_ATTEMPTS,
                backoff: {
                  type: "exponential",
                  delayMs: DESTINATION_SYNC_RETRY_BACKOFF_MS,
                },
              },
            ),
        }).pipe(
          withPostgres(DestinationSourceStateRepositoryLive, adminPgClient),
          Effect.tap((result) =>
            Effect.sync(() =>
              logger.info(`destinations.sweep due=${result.due} published=${result.published} failed=${result.failed}`),
            ),
          ),
          Effect.tapError((error) => Effect.sync(() => logger.error("destinations.sweep failed", error))),
          withTracing,
          Effect.asVoid,
        ),

      pruneSyncRuns: () =>
        pruneDestinationSyncRunsUseCase({ now: new Date() }).pipe(
          withPostgres(DestinationSyncRunRepositoryLive, adminPgClient),
          Effect.tap((result) => Effect.sync(() => logger.info(`destinations.pruneSyncRuns pruned=${result.pruned}`))),
          Effect.tapError((error) => Effect.sync(() => logger.error("destinations.pruneSyncRuns failed", error))),
          withTracing,
          Effect.asVoid,
        ),

      runSync: (payload) => {
        const organizationId = OrganizationId(payload.organizationId)
        const source = payload.source as DestinationSource
        const destinationId = DestinationId(payload.destinationId)
        return Effect.gen(function* () {
          // Only the project slug (for the cross-link URL) is resolved here; the
          // use case owns loading the destination + source cursor and skipping a
          // deleted/paused/cursor-less pair.
          const projectSlug = yield* loadProjectSlug(payload.projectId)
          const mapperRegistry = makeMapperRegistry(projectSlug)

          const result = yield* runDestinationSyncUseCase({
            destinationId,
            source,
            now: new Date(),
            ...(devSafetyLagMs === undefined ? {} : { safetyLagMs: devSafetyLagMs }),
          }).pipe(
            withClickHouse(sourceReadersLive, chClient, organizationId),
            Effect.provide(Layer.succeed(DestinationDeliverers, delivererRegistry)),
            Effect.provide(Layer.succeed(DestinationMappers, mapperRegistry)),
          )

          // Per-run ops metric (P3-3): spans read, events sent/dropped, and lag
          // (now − cursor watermark). Datadog alarms parse this line.
          logger.info(
            `destinations.runSync destinationId=${destinationId} source=${source} outcome=${result.outcome} recordsRead=${result.recordsRead} eventsSent=${result.eventsSent} eventsDropped=${result.eventsDropped} lagMs=${result.lagMs} quarantined=${result.quarantined}`,
          )

          if (result.quarantineEvent) {
            yield* publishQuarantineNotification(result.quarantineEvent)
          }
        }).pipe(
          withPostgres(runSyncLayer, pgClient, organizationId),
          // Retryable delivery failures propagate so BullMQ retries with the cursor
          // untouched; the onFinalFailure hook does the quarantine accounting once
          // retries are exhausted.
          Effect.tapError((error) =>
            Effect.sync(() => logger.warn(`destinations.runSync error destinationId=${payload.destinationId}`, error)),
          ),
          withTracing,
          Effect.asVoid,
        )
      },

      "delete-by-project": (payload) =>
        deleteProjectDestinationsUseCase({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
        }).pipe(
          Effect.tap((result) =>
            Effect.sync(() =>
              logger.info(`destinations.delete-by-project projectId=${payload.projectId} deleted=${result.deleted}`),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error(`destinations.delete-by-project failed projectId=${payload.projectId}`, error),
            ),
          ),
          withPostgres(deleteByProjectLayer, pgClient, OrganizationId(payload.organizationId)),
          Effect.asVoid,
          withTracing,
        ),
    },
    {
      onFinalFailure: {
        runSync: (payload, error) =>
          recordDestinationSyncFailureUseCase({
            destinationId: DestinationId(payload.destinationId),
            source: payload.source as DestinationSource,
            now: new Date(),
            message: finalFailureMessage(error),
          }).pipe(
            withPostgres(recordFailureLayer, pgClient, OrganizationId(payload.organizationId)),
            Effect.tap((result) =>
              Effect.sync(() =>
                logger.warn(
                  `destinations.runSync exhausted retries destinationId=${payload.destinationId} outcome=${result.outcome} consecutiveFailures=${result.consecutiveFailures}`,
                ),
              ),
            ),
            Effect.tap((result) =>
              result.quarantineEvent ? publishQuarantineNotification(result.quarantineEvent) : Effect.void,
            ),
            Effect.tapError((failure) =>
              Effect.sync(() =>
                logger.error(
                  `destinations.runSync failure accounting errored destinationId=${payload.destinationId}`,
                  failure,
                ),
              ),
            ),
            withTracing,
            Effect.asVoid,
          ),
      },
    },
  )

  // Backfill lane — its own queue at a capped concurrency, so a long/large backfill
  // can only ever hold `DESTINATION_BACKFILL_CONCURRENCY` slots and never starves the
  // live sync running on the `destinations` queue.
  consumer.subscribe(
    "destinations-backfill",
    {
      backfill: (payload) => {
        const organizationId = OrganizationId(payload.organizationId)
        const source = payload.source as DestinationSource
        const base = {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          destinationId: payload.destinationId,
          source,
        }
        return backfillDestinationUseCase({
          destinationId: DestinationId(payload.destinationId),
          source,
          start: payload.since ? new Date(payload.since) : null,
          end: payload.until ? new Date(payload.until) : null,
          now: new Date(),
          publish: (job) => publishBackfillWindow(base, job),
        }).pipe(
          withPostgres(backfillLayer, pgClient, organizationId),
          Effect.provide(Layer.succeed(DestinationDeliverers, delivererRegistry)),
          Effect.provide(retentionPolicyLayer),
          Effect.tap((result) =>
            Effect.sync(() =>
              logger.info(
                `destinations.backfill destinationId=${payload.destinationId} source=${source} outcome=${result.outcome} segments=${result.segmentsPlanned} clampedStart=${result.clampedStart.toISOString()}`,
              ),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error(`destinations.backfill failed destinationId=${payload.destinationId}`, error),
            ),
          ),
          withTracing,
          Effect.asVoid,
        )
      },

      runBackfillWindow: (payload) => {
        const organizationId = OrganizationId(payload.organizationId)
        const source = payload.source as DestinationSource
        const base = {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          destinationId: payload.destinationId,
          source,
        }
        return Effect.gen(function* () {
          const projectSlug = yield* loadProjectSlug(payload.projectId)
          const mapperRegistry = makeMapperRegistry(projectSlug)

          const result = yield* runBackfillWindowUseCase({
            destinationId: DestinationId(payload.destinationId),
            source,
            cursor: { watermark: new Date(payload.cursorWatermark), id: payload.cursorId },
            segmentEnd: new Date(payload.segmentEnd),
            remainingSegments: payload.remainingSegments.map((s) => ({
              start: new Date(s.start),
              end: new Date(s.end),
            })),
            coverageFloor: new Date(payload.coverageFloor),
            now: new Date(),
          }).pipe(
            withClickHouse(sourceReadersLive, chClient, organizationId),
            Effect.provide(Layer.succeed(DestinationDeliverers, delivererRegistry)),
            Effect.provide(Layer.succeed(DestinationMappers, mapperRegistry)),
          )

          logger.info(
            `destinations.runBackfillWindow destinationId=${payload.destinationId} source=${source} outcome=${result.outcome} recordsRead=${result.recordsRead} eventsSent=${result.eventsSent} eventsDropped=${result.eventsDropped} hasNext=${result.next !== null}`,
          )

          // Drive the chain forward: the next window is enqueued only after this one
          // landed, so a backfill is paced (one capped window in flight per chain).
          if (result.next) yield* publishBackfillWindow(base, result.next)
        }).pipe(
          withPostgres(runSyncLayer, pgClient, organizationId),
          // Retryable delivery failures propagate so BullMQ retries this window with
          // the chain untouched; exhausting retries stops the chain (idempotent re-trigger).
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.warn(`destinations.runBackfillWindow error destinationId=${payload.destinationId}`, error),
            ),
          ),
          withTracing,
          Effect.asVoid,
        )
      },
    },
    {
      concurrency: DESTINATION_BACKFILL_CONCURRENCY,
      onFinalFailure: {
        // The initiator dying before any window has no window context → just clear the marker.
        backfill: (payload) => clearBackfillInFlight(payload),
        // A window exhausting retries records a failed run row (visible in history) + clears the marker.
        runBackfillWindow: (payload, error) => recordBackfillWindowFailure(payload, error),
      },
    },
  )
}
