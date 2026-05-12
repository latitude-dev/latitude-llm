import { AI } from "@domain/ai"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  buildTraceSearchDocument,
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MIN_LENGTH,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TraceRepository,
  TraceSearchBudget,
  type TraceSearchChunk,
  TraceSearchRepository,
} from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import type { RedisClient } from "@platform/cache-redis"
import { EmbedBudgetResolverLive, RedisCacheStoreLive, TraceSearchBudgetLive } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { TraceRepositoryLive, TraceSearchRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  BillingOverrideRepositoryLive,
  type PostgresClient,
  resolveEffectivePlanCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"

const logger = createLogger("trace-search")
const TRACE_SEARCH_FALLBACK_RETENTION_DAYS = 30

interface TraceSearchDeps {
  consumer: QueueConsumer
  clickhouseClient: ClickHouseClient
  postgresClient: PostgresClient
  redisClient: RedisClient
}

interface TraceSearchRunDeps {
  clickhouseClient: ClickHouseClient
  postgresClient: PostgresClient
  redisClient: RedisClient
}

interface RefreshTracePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly startTime: string
  readonly rootSpanName: string
}

export const resolveTraceSearchRetentionDays = (organizationId: string) =>
  resolveEffectivePlanCached(OrganizationId(organizationId)).pipe(
    Effect.map((plan) => plan.plan.retentionDays),
    Effect.tapError((error) =>
      Effect.sync(() =>
        logger.warn("Trace search billing lookup degraded; using fallback retention", {
          organizationId,
          retentionDays: TRACE_SEARCH_FALLBACK_RETENTION_DAYS,
          error,
        }),
      ),
    ),
    Effect.orElseSucceed(() => TRACE_SEARCH_FALLBACK_RETENTION_DAYS),
  )

/**
 * Generate embedding for search text using the AI embedding service.
 */
const generateEmbedding = (searchText: string): Effect.Effect<readonly number[], never, AI> =>
  Effect.gen(function* () {
    const ai = yield* AI
    const result = yield* ai.embed({
      text: searchText,
      model: TRACE_SEARCH_EMBEDDING_MODEL,
      dimensions: TRACE_SEARCH_EMBEDDING_DIMENSIONS,
      telemetry: {
        spanName: "trace-search.embed",
        name: "trace-search-embed",
        tags: ["trace-search", "embedding"],
      },
    })
    return result.embedding as readonly number[]
  }).pipe(
    Effect.orElseSucceed(() => {
      logger.error("Failed to generate embedding")
      return [] as number[]
    }),
  )

export const prioritizeChunksForEmbedding = (chunks: readonly TraceSearchChunk[]) =>
  [...chunks]
    .filter((chunk) => chunk.text.length >= TRACE_SEARCH_EMBEDDING_MIN_LENGTH)
    .sort((a, b) => b.chunkIndex - a.chunkIndex)

/**
 * Process a trace search refresh task:
 *  1. Load canonical conversation messages for the trace.
 *  2. Build the search document (lexical text + per-chunk slices).
 *  3. Upsert the lexical document from canonical trace text. This is built
 *     independently of which chunks are selected for embeddings.
 *  4. For each chunk above the min-length floor, dedup-by-hash → budget-gate →
 *     embed → upsert one row per chunk.
 */
const processRefreshTrace = (payload: RefreshTracePayload) =>
  Effect.gen(function* () {
    const traceRepo = yield* TraceRepository
    const traceSearchRepo = yield* TraceSearchRepository

    const organizationId = payload.organizationId
    const projectId = payload.projectId
    const traceId = payload.traceId
    const startTime = new Date(payload.startTime)
    const retentionDays = yield* resolveTraceSearchRetentionDays(organizationId)

    const traceDetail = yield* traceRepo.findByTraceId({
      organizationId: OrganizationId(organizationId),
      projectId: ProjectId(projectId),
      traceId: TraceId(traceId),
    })

    if (traceDetail.allMessages.length === 0) {
      logger.info(`No conversation messages found for trace ${traceId}, skipping search indexing`)
      return
    }

    const searchDocument = yield* buildTraceSearchDocument({
      traceId,
      startTime,
      rootSpanName: payload.rootSpanName,
      messages: traceDetail.allMessages,
    })

    yield* traceSearchRepo.upsertDocument({
      organizationId: OrganizationId(organizationId),
      projectId: ProjectId(projectId),
      traceId: TraceId(traceId),
      startTime,
      rootSpanName: searchDocument.rootSpanName,
      searchText: searchDocument.searchText,
      contentHash: searchDocument.contentHash,
      retentionDays,
    })

    logger.info(`Indexed lexical search document for trace ${traceId}`)

    // Chunk indices are assigned in chronological order, so processing them in
    // descending order prioritizes the tail when budget pressure means we may
    // not get to every chunk.
    const eligibleChunks = prioritizeChunksForEmbedding(searchDocument.chunks)

    if (eligibleChunks.length === 0) {
      logger.info(
        `Trace ${traceId} produced no embedding-eligible chunks (each below ${TRACE_SEARCH_EMBEDDING_MIN_LENGTH} chars), skipping semantic index`,
      )
      return
    }

    const budget = yield* TraceSearchBudget

    let embeddedCount = 0
    let skippedDuplicate = 0

    for (const chunk of eligibleChunks) {
      const hasExisting = yield* traceSearchRepo.hasEmbeddingWithHash(
        OrganizationId(organizationId),
        ProjectId(projectId),
        TraceId(traceId),
        chunk.chunkIndex,
        chunk.contentHash,
      )

      if (hasExisting) {
        skippedDuplicate++
        continue
      }

      // Budget gate per-chunk. If any window would overflow we stop
      // embedding remaining chunks for this trace so we don't end up with
      // a partial-but-skewed chunk set; the lexical document was already
      // written independently. Tracker errors fail open.
      const estimatedTokens = Math.ceil(chunk.text.length / 4)
      const budgetOk = yield* budget.tryConsume(OrganizationId(organizationId), estimatedTokens).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => logger.warn(`Embed budget check failed for org ${organizationId}`, error)),
        ),
        Effect.orElseSucceed(() => true),
      )

      if (!budgetOk) {
        logger.info(
          `Org ${organizationId} over embed budget (est ${estimatedTokens} tokens); stopping at chunk ${chunk.chunkIndex} of trace ${traceId}`,
        )
        break
      }

      const embedding = yield* generateEmbedding(chunk.text)

      if (embedding.length === 0) {
        logger.warn(`Failed to generate embedding for trace ${traceId} chunk ${chunk.chunkIndex}, skipping`)
        continue
      }

      yield* traceSearchRepo.upsertEmbedding({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        traceId: TraceId(traceId),
        chunkIndex: chunk.chunkIndex,
        startTime,
        contentHash: chunk.contentHash,
        embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
        embedding,
        retentionDays,
      })
      embeddedCount++
    }

    logger.info(
      `Indexed semantic search embeddings for trace ${traceId}: ${embeddedCount} embedded, ${skippedDuplicate} unchanged`,
    )
  }).pipe(
    Effect.withSpan("trace-search.refreshTrace"),
    Effect.tapError((error) =>
      Effect.sync(() => {
        logger.error(`Failed to refresh trace search for ${payload.traceId}`, error)
      }),
    ),
    Effect.orElseSucceed(() => undefined), // Never fail the job
  )

export const createTraceSearchWorker = ({
  consumer,
  clickhouseClient,
  postgresClient,
  redisClient,
}: TraceSearchDeps) => {
  const chClient = clickhouseClient
  const pgClient = postgresClient
  const rdClient = redisClient

  consumer.subscribe("trace-search", {
    refreshTrace: (payload) =>
      runTraceSearchRefresh(payload as RefreshTracePayload, {
        clickhouseClient: chClient,
        postgresClient: pgClient,
        redisClient: rdClient,
      }),
  })
}

export const runTraceSearchRefresh = (payload: RefreshTracePayload, deps: TraceSearchRunDeps) => {
  const clickhouseClient = deps.clickhouseClient
  const postgresClient = deps.postgresClient
  const redisClient = deps.redisClient
  const budgetLayer = Layer.provide(TraceSearchBudgetLive(redisClient), EmbedBudgetResolverLive)

  return processRefreshTrace(payload).pipe(
    withPostgres(
      Layer.mergeAll(BillingOverrideRepositoryLive, SettingsReaderLive, StripeSubscriptionLookupLive),
      postgresClient,
      OrganizationId(payload.organizationId),
    ),
    withClickHouse(
      Layer.mergeAll(TraceRepositoryLive, TraceSearchRepositoryLive),
      clickhouseClient,
      OrganizationId(payload.organizationId),
    ),
    withAi(AIEmbedLive, redisClient),
    Effect.provide(Layer.mergeAll(RedisCacheStoreLive(redisClient), budgetLayer)),
    withTracing,
    Effect.asVoid,
  )
}
