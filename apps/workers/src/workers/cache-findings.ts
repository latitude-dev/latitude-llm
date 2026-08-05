import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  CACHE_FINDING_SYNC_THROTTLE_MS,
  cacheFindingSyncDedupeKey,
  type SyncCacheFindingSignalsResult,
  syncCacheFindingSignalsUseCase,
} from "@domain/signals"
import type { JudgedCacheModel } from "@domain/spans"
import { CostAnalyticsRepository, cacheFindingWindows, judgeCacheEconomics } from "@domain/spans"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { CostAnalyticsRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  CacheFindingRepositoryLive,
  EvaluationRepositoryLive,
  type GardenableProjectRef,
  listGardenableProjectRefs,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  SettingsReaderLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("cache-findings")

interface CacheFindingsDeps {
  readonly consumer: QueueConsumer
  readonly publisher: QueuePublisherShape
  readonly postgresClient: PostgresClient
  readonly adminPostgresClient: PostgresClient
  readonly clickhouseClient: ClickHouseClient
}

interface SyncCacheFindingsPayload {
  readonly organizationId: string
  readonly projectId: string
}

interface CacheFindingSweepDeps {
  readonly listActiveProjects: () => Effect.Effect<readonly GardenableProjectRef[], unknown>
  readonly publisher: QueuePublisherShape
}

/**
 * Fan out one sync per live project. No eligibility read here on purpose: whether a
 * project has traffic worth judging is decided by the gates in the sync, and a cheap
 * pre-filter here would be a second, weaker copy of them.
 */
const runCacheFindingSweepJob = (deps: CacheFindingSweepDeps) =>
  Effect.gen(function* () {
    const projects = yield* deps.listActiveProjects()
    let published = 0
    let failed = 0

    for (const project of projects) {
      yield* Effect.gen(function* () {
        yield* deps.publisher.publish(
          "cost-findings",
          "sync",
          { organizationId: project.organization_id, projectId: project.project_id },
          {
            dedupeKey: cacheFindingSyncDedupeKey({
              organizationId: project.organization_id,
              projectId: project.project_id,
            }),
            throttleMs: CACHE_FINDING_SYNC_THROTTLE_MS,
          },
        )
        published++
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            failed++
            logger.warn("Cache finding sweep enqueue failed", {
              organizationId: project.organization_id,
              projectId: project.project_id,
              error,
            })
          }),
        ),
      )
    }

    logger.info("Cache finding sweep completed", { attempted: projects.length, published, failed })
  }).pipe(
    Effect.tapError((error) => Effect.sync(() => logger.error("Cache finding sweep failed", error))),
    withTracing,
    Effect.withSpan("cacheFindings.sweep"),
    Effect.asVoid,
  )

const readJudgedWindows = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly anchor: Date
}) =>
  Effect.gen(function* () {
    const repo = yield* CostAnalyticsRepository
    const windows: JudgedCacheModel[][] = []
    for (const window of cacheFindingWindows(input.anchor)) {
      const economics = yield* repo.getCacheEconomics({
        organizationId: input.organizationId,
        projectId: input.projectId,
        from: window.from,
        to: window.to,
      })
      windows.push([...judgeCacheEconomics({ economics, windowMs: window.to.getTime() - window.from.getTime() })])
    }
    return windows as readonly (readonly JudgedCacheModel[])[]
  })

const runSyncCacheFindingsJob = (
  payload: SyncCacheFindingsPayload,
  deps: {
    readonly postgresClient: PostgresClient
    readonly clickhouseClient: ClickHouseClient
  },
) => {
  const organizationId = OrganizationId(payload.organizationId)
  const projectId = ProjectId(payload.projectId)

  return Effect.gen(function* () {
    const windows = yield* readJudgedWindows({ organizationId, projectId, anchor: new Date() }).pipe(
      withClickHouse(CostAnalyticsRepositoryLive, deps.clickhouseClient, organizationId),
    )
    return yield* syncCacheFindingSignalsUseCase({ organizationId, projectId, windows }).pipe(
      withPostgres(
        Layer.mergeAll(
          CacheFindingRepositoryLive,
          EvaluationRepositoryLive,
          OutboxEventWriterLive,
          ProjectRepositoryLive,
          SettingsReaderLive,
          SignalRepositoryLive,
        ),
        deps.postgresClient,
        organizationId,
      ),
    )
  }).pipe(
    Effect.tap((result: SyncCacheFindingSignalsResult) =>
      Effect.sync(() =>
        logger.info("Cache findings synced", {
          metric: "cost.cacheFindings.sync",
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          opened: result.opened.length,
          refreshed: result.refreshed.length,
          resolved: result.resolved.length,
          suppressed: result.suppressed,
        }),
      ),
    ),
    Effect.tapError((error) =>
      Effect.sync(() =>
        logger.error("Cache finding sync failed", {
          organizationId: payload.organizationId,
          projectId: payload.projectId,
          error,
        }),
      ),
    ),
    withTracing,
    Effect.withSpan("cacheFindings.sync"),
    Effect.asVoid,
  )
}

export const createCacheFindingsWorker = ({
  consumer,
  publisher,
  postgresClient,
  adminPostgresClient,
  clickhouseClient,
}: CacheFindingsDeps) => {
  consumer.subscribe("cost-findings", {
    sweep: () =>
      runCacheFindingSweepJob({
        listActiveProjects: () =>
          Effect.tryPromise({
            try: () => listGardenableProjectRefs(adminPostgresClient),
            catch: (cause) => cause,
          }),
        publisher,
      }),
    sync: (payload) =>
      runSyncCacheFindingsJob(payload as SyncCacheFindingsPayload, { postgresClient, clickhouseClient }),
  })
}
