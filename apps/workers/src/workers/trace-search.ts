import { AI } from "@domain/ai"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  buildTraceSearchDocument,
  SpanRepository,
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TRACE_SEARCH_SEMANTIC_CAP,
  TraceSearchRepository,
} from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import type { RedisClient } from "@platform/cache-redis"
import { RedisCacheStoreLive } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import { SpanRepositoryLive, TraceSearchRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getRedisClient } from "../clients.ts"

const logger = createLogger("trace-search")

interface TraceSearchDeps {
  consumer: QueueConsumer
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
 * Check if a trace is eligible for semantic indexing based on the per-project cap.
 * V1 uses a simple recent-trace cap - the latest N traces per project are eligible.
 */
const isEligibleForSemanticIndexing = (
  traceSearchRepo: typeof TraceSearchRepository.Service,
  organizationId: string,
  projectId: string,
): Effect.Effect<boolean, never, never> =>
  Effect.gen(function* () {
    const currentCount = yield* traceSearchRepo.countDocumentsByProject(
      OrganizationId(organizationId),
      ProjectId(projectId),
    )
    // Eligible if we're under the cap
    return currentCount < TRACE_SEARCH_SEMANTIC_CAP
  }).pipe(
    Effect.orElseSucceed(() => {
      // Default to eligible on error
      logger.warn("Failed to check semantic eligibility, defaulting to eligible")
      return true
    }),
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

/**
 * Process a trace search refresh task:
 * 1. Load span messages for the trace
 * 2. Build the search document (excludes system prompts)
 * 3. Upsert the lexical document
 * 4. Check semantic eligibility
 * 5. If eligible and changed, generate embedding and upsert
 */
const processRefreshTrace = (payload: RefreshTracePayload) =>
  Effect.gen(function* () {
    const spanRepo = yield* SpanRepository
    const traceSearchRepo = yield* TraceSearchRepository

    const organizationId = payload.organizationId
    const projectId = payload.projectId
    const traceId = payload.traceId
    const startTime = new Date(payload.startTime)

    // 1. Load span messages for the trace
    const spanMessages = yield* spanRepo.findMessagesForTrace({
      organizationId: OrganizationId(organizationId),
      traceId: TraceId(traceId),
    })

    if (spanMessages.length === 0) {
      logger.info(`No span messages found for trace ${traceId}, skipping search indexing`)
      return
    }

    // 2. Build the search document
    const inputMessages = spanMessages.flatMap((sm) => sm.inputMessages)
    const outputMessages = spanMessages.flatMap((sm) => sm.outputMessages)

    const searchDocument = buildTraceSearchDocument({
      traceId,
      startTime,
      rootSpanName: payload.rootSpanName,
      inputMessages,
      outputMessages,
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

    // 4. Check semantic eligibility
    const eligible = yield* isEligibleForSemanticIndexing(traceSearchRepo, organizationId, projectId)

    if (!eligible) {
      logger.info(`Trace ${traceId} not eligible for semantic indexing (cap reached)`)
      return
    }

    // 5. Check if embedding already exists with same hash
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

    // 6. Generate embedding and upsert
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
      processRefreshTrace(payload as RefreshTracePayload).pipe(
        withClickHouse(
          Layer.mergeAll(SpanRepositoryLive, TraceSearchRepositoryLive),
          chClient,
          OrganizationId(payload.organizationId),
        ),
        withAi(AIEmbedLive, rdClient),
        Effect.provide(RedisCacheStoreLive(rdClient)),
        withTracing,
        Effect.asVoid,
      ),
  })
}
