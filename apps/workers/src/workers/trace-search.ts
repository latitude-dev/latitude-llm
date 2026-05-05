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
  TraceSearchRepository,
} from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import type { RedisClient } from "@platform/cache-redis"
import { EmbedBudgetResolverLive, RedisCacheStoreLive, TraceSearchBudgetLive } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { TraceRepositoryLive, TraceSearchRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getRedisClient } from "../clients.ts"

const logger = createLogger("trace-search")

interface TraceSearchDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
}

interface TraceSearchRunDeps {
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
}

interface RefreshTracePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly startTime: string
  readonly rootSpanName: string
}

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

/**
 * Process a trace search refresh task:
 * 1. Load canonical conversation messages for the trace
 * 2. Build the search document (conversation only, excludes system prompts)
 * 3. Upsert the lexical document
 * 4. Check semantic eligibility
 * 5. If eligible and changed, generate embedding and upsert
 */
const processRefreshTrace = (payload: RefreshTracePayload) =>
  Effect.gen(function* () {
    const traceRepo = yield* TraceRepository
    const traceSearchRepo = yield* TraceSearchRepository

    const organizationId = payload.organizationId
    const projectId = payload.projectId
    const traceId = payload.traceId
    const startTime = new Date(payload.startTime)

    // 1. Load the canonical conversation for the trace. This preserves the
    // same chronological de-duplicated message list shown in the trace detail
    // drawer, instead of rebuilding from span inputs that can repeat context.
    const traceDetail = yield* traceRepo.findByTraceId({
      organizationId: OrganizationId(organizationId),
      projectId: ProjectId(projectId),
      traceId: TraceId(traceId),
    })

    if (traceDetail.allMessages.length === 0) {
      logger.info(`No conversation messages found for trace ${traceId}, skipping search indexing`)
      return
    }

    // 2. Build the search document
    const searchDocument = yield* buildTraceSearchDocument({
      traceId,
      startTime,
      rootSpanName: payload.rootSpanName,
      messages: traceDetail.allMessages,
    })

    // 3. Upsert the lexical document
    yield* traceSearchRepo.upsertDocument({
      organizationId: OrganizationId(organizationId),
      projectId: ProjectId(projectId),
      traceId: TraceId(traceId),
      startTime,
      rootSpanName: searchDocument.rootSpanName,
      searchText: searchDocument.searchText,
      contentHash: searchDocument.contentHash,
    })

    logger.info(`Indexed lexical search document for trace ${traceId}`)

    // 4. Skip semantic indexing for near-empty traces. Short documents embed
    // into uninformative vectors that cluster at similar distances from every
    // query, adding retrieval noise while still costing Voyage credits.
    if (searchDocument.searchText.length < TRACE_SEARCH_EMBEDDING_MIN_LENGTH) {
      logger.info(
        `Trace ${traceId} below embedding min length (${searchDocument.searchText.length} < ${TRACE_SEARCH_EMBEDDING_MIN_LENGTH}), skipping semantic index`,
      )
      return
    }

    // 5. Dedupe against an existing identical embedding. Stale rows age out
    // via the ClickHouse TTL on `trace_search_embeddings`; this worker always
    // embeds eligible new traces (subject to budget check below).
    const hasExisting = yield* traceSearchRepo.hasEmbeddingWithHash(
      OrganizationId(organizationId),
      ProjectId(projectId),
      TraceId(traceId),
      searchDocument.contentHash,
    )

    if (hasExisting) {
      logger.info(`Embedding already exists for trace ${traceId} with same hash, skipping`)
      return
    }

    // 6. Gate on the per-org token budget *before* calling Voyage. If any of
    // the daily / weekly / monthly windows would overflow, `tryConsume` leaves
    // the counters untouched and returns false — we then skip the embed call
    // entirely (trace stays lexical-only). Tracker errors (Redis down) fail
    // open: we log and proceed so an infra blip doesn't silently disable
    // semantic indexing.
    const budget = yield* TraceSearchBudget
    const estimatedTokens = Math.ceil(searchDocument.searchText.length / 4)
    const budgetOk = yield* budget.tryConsume(OrganizationId(organizationId), estimatedTokens).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => logger.warn(`Embed budget check failed for org ${organizationId}`, error)),
      ),
      Effect.orElseSucceed(() => true),
    )

    if (!budgetOk) {
      logger.info(
        `Org ${organizationId} over embed budget (est ${estimatedTokens} tokens); skipping semantic index for trace ${traceId}`,
      )
      return
    }

    // 7. Generate the embedding. Budget was already debited in step 6; a
    // Voyage failure here means we paid tokens that never shipped, which is
    // acceptable at our scales (the budget is a cost ceiling, not a financial
    // contract) and keeps the enforcement path simple.
    const embedding = yield* generateEmbedding(searchDocument.searchText)

    if (embedding.length === 0) {
      logger.warn(`Failed to generate embedding for trace ${traceId}, skipping semantic index`)
      return
    }

    yield* traceSearchRepo.upsertEmbedding({
      organizationId: OrganizationId(organizationId),
      projectId: ProjectId(projectId),
      traceId: TraceId(traceId),
      startTime,
      contentHash: searchDocument.contentHash,
      embeddingModel: TRACE_SEARCH_EMBEDDING_MODEL,
      embedding,
    })

    logger.info(`Indexed semantic search embedding for trace ${traceId}`)
  }).pipe(
    Effect.withSpan("trace-search.refreshTrace"),
    Effect.tapError((error) =>
      Effect.sync(() => {
        logger.error(`Failed to refresh trace search for ${payload.traceId}`, error)
      }),
    ),
    Effect.orElseSucceed(() => undefined), // Never fail the job
  )

export const createTraceSearchWorker = ({ consumer, clickhouseClient, redisClient }: TraceSearchDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()

  consumer.subscribe("trace-search", {
    refreshTrace: (payload) =>
      runTraceSearchRefresh(payload as RefreshTracePayload, {
        clickhouseClient: chClient,
        redisClient: rdClient,
      }),
  })
}

export const runTraceSearchRefresh = (payload: RefreshTracePayload, deps: TraceSearchRunDeps = {}) => {
  const clickhouseClient = deps.clickhouseClient ?? getClickhouseClient()
  const redisClient = deps.redisClient ?? getRedisClient()
  const budgetLayer = Layer.provide(TraceSearchBudgetLive(redisClient), EmbedBudgetResolverLive)

  return processRefreshTrace(payload).pipe(
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
