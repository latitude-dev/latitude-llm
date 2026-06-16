import {
  createPosthogMapper,
  DESTINATION_SYNC_MAX_ATTEMPTS,
  DESTINATION_SYNC_RETRY_BACKOFF_MS,
  type DestinationDelivererRegistry,
  DestinationDeliverers,
  type DestinationMapperRegistry,
  DestinationMappers,
  type DestinationSource,
  deleteProjectDestinationsUseCase,
  pruneDestinationSyncRunsUseCase,
  recordDestinationSyncFailureUseCase,
  runDestinationSyncUseCase,
  SpansSourceReadersLive,
  sweepDestinationsUseCase,
} from "@domain/destinations"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { DestinationId, OrganizationId, ProjectId } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import { createPosthogDeliverer, POSTHOG_EVENT_MAX_BYTES } from "@platform/data-destinations"
import { type ClickHouseClient, SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  DestinationRepositoryLive,
  DestinationSourceCursorRepositoryLive,
  DestinationSyncRunRepositoryLive,
  type PostgresClient,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getPostgresClient } from "../clients.ts"

const logger = createLogger("destinations")

interface DestinationsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  postgresClient?: PostgresClient
  adminPostgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
}

const deleteByProjectLayer = Layer.mergeAll(
  DestinationRepositoryLive,
  DestinationSourceCursorRepositoryLive,
  DestinationSyncRunRepositoryLive,
)
const runSyncLayer = Layer.mergeAll(
  DestinationRepositoryLive,
  DestinationSourceCursorRepositoryLive,
  DestinationSyncRunRepositoryLive,
  ProjectRepositoryLive,
)
const recordFailureLayer = Layer.mergeAll(DestinationRepositoryLive, DestinationSourceCursorRepositoryLive)

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
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
}: DestinationsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const adminPgClient = adminPostgresClient ?? getAdminPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const webUrl = resolveWebUrl()
  const devSafetyLagMs = resolveDevSafetyLagMs()

  // Kind-stable, built once; the mapper is built per-run because its span-URL
  // builder depends on the run's project slug.
  const delivererRegistry: DestinationDelivererRegistry = {
    posthog: createPosthogDeliverer(),
  }

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
          withPostgres(DestinationSourceCursorRepositoryLive, adminPgClient),
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
          const projects = yield* ProjectRepository
          const projectSlug = yield* projects.findById(ProjectId(payload.projectId)).pipe(
            Effect.map((project) => project.slug),
            Effect.orElseSucceed(() => payload.projectId),
          )

          const mapperRegistry: DestinationMapperRegistry = {
            posthog: createPosthogMapper({
              buildSpanUrl: spanUrlBuilder(webUrl, projectSlug),
              maxEventBytes: POSTHOG_EVENT_MAX_BYTES,
            }),
          }

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

          logger.info(
            `destinations.runSync destinationId=${destinationId} source=${source} outcome=${result.outcome} spansRead=${result.spansRead} eventsSent=${result.eventsSent} eventsDropped=${result.eventsDropped} quarantined=${result.quarantined}`,
          )
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
}
