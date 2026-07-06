import { AI, type AIProviderModelConfig, resolveEmbeddingConfig } from "@domain/ai"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer, QueuePublisherShape } from "@domain/queue"
import { LATITUDE_TELEMETRY_PROJECT_SLUGS, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  buildTraceSearchDocument,
  canonicalizeMessageForEmbedding,
  extractTraceSearchEmbeddingMessages,
  hashMessageContent,
  isTraceSearchSemanticMessage,
  MessageEmbeddingRepository,
  type MessageEmbeddingUpsert,
  TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE,
  TraceRepository,
  TraceSearchBudget,
  TraceSearchRepository,
} from "@domain/spans"
import { AIEmbedLive, withAi } from "@platform/ai"
import type { RedisClient } from "@platform/cache-redis"
import { EmbedBudgetResolverLive, RedisCacheStoreLive, TraceSearchBudgetLive } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import {
  MessageEmbeddingRepositoryLive,
  TraceRepositoryLive,
  TraceSearchRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  BillingOverrideRepositoryLive,
  OrganizationRepositoryLive,
  type PostgresClient,
  ProjectRepositoryLive,
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
  publisher: QueuePublisherShape
  clickhouseClient: ClickHouseClient
  postgresClient: PostgresClient
  redisClient: RedisClient
}

interface TraceSearchRunDeps {
  clickhouseClient: ClickHouseClient
  postgresClient: PostgresClient
  redisClient: RedisClient
  // Absent for backfills, which must not fan out a re-trigger per historical trace.
  publisher?: QueuePublisherShape
}

interface RefreshTracePayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly startTime: string
  readonly rootSpanName: string
  readonly isSandbox?: boolean
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
const generateEmbedding = (
  searchText: string,
  embeddingConfig: AIProviderModelConfig,
): Effect.Effect<readonly number[], never, AI> =>
  Effect.gen(function* () {
    const ai = yield* AI
    const result = yield* ai.embed({
      text: searchText,
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
      inputType: "document",
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

const estimateEmbeddingTokens = (texts: readonly string[]): number =>
  texts.reduce((sum, text) => sum + Math.ceil(text.length / TRACE_SEARCH_CHARS_PER_TOKEN_ESTIMATE), 0)

const uniqueMessagesByHash = <T extends { readonly contentHash: string }>(messages: readonly T[]): readonly T[] => {
  const byHash = new Map<string, T>()
  for (const message of messages) {
    if (!byHash.has(message.contentHash)) byHash.set(message.contentHash, message)
  }
  return [...byHash.values()]
}

/**
 * A trace is ready to re-trigger semantic evals when it has any vector for the active model — counting
 * both messages embedded this run AND pre-existing hash hits (vectors a sibling trace already wrote).
 * Gating on embeddedCount alone would miss the all-hash-hit case and leave those evals stuck.
 */
export const shouldRetriggerSignalsMatch = (input: {
  readonly embeddingConfigResolved: boolean
  readonly existingCount: number
  readonly embeddedCount: number
}): boolean => input.embeddingConfigResolved && input.existingCount + input.embeddedCount > 0

const isLatitudeTelemetryProject = (projectId: string) =>
  Effect.gen(function* () {
    const projectRepo = yield* ProjectRepository
    const project = yield* projectRepo.findById(ProjectId(projectId)).pipe(
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.warn(`Could not resolve project ${projectId}; semantic indexing remains enabled`, error),
        ),
      ),
      Effect.orElseSucceed(() => undefined),
    )

    return project ? (Object.values(LATITUDE_TELEMETRY_PROJECT_SLUGS) as string[]).includes(project.slug) : false
  })

/**
 * Process a trace search refresh task:
 *  1. Load canonical conversation messages for the trace.
 *  2. Build the search document (lexical text only for the semantic path).
 *  3. Upsert the lexical document from canonical trace text. This is built
 *     independently of which messages already have embeddings.
 *  4. Canonicalize each semantic-search eligible message, ensure shared vectors exist, and
 *     insert per-trace occurrence rows unconditionally.
 *  5. Once the trace has embeddings, re-trigger signals:match so semantic evals that deferred while
 *     waiting for vectors run the moment they land.
 */
export const processRefreshTrace = (payload: RefreshTracePayload, publisher?: QueuePublisherShape) =>
  Effect.gen(function* () {
    if (payload.isSandbox) return

    const traceRepo = yield* TraceRepository
    const traceSearchRepo = yield* TraceSearchRepository
    const messageEmbeddingRepo = yield* MessageEmbeddingRepository

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

    if (yield* isLatitudeTelemetryProject(projectId)) {
      logger.info(`Trace ${traceId} belongs to the Latitude telemetry project; skipping semantic search embeddings`)
      return
    }

    const outputStartIndex = traceDetail.allMessages.length - traceDetail.outputMessages.length
    const hashedMessages = yield* Effect.forEach(
      extractTraceSearchEmbeddingMessages(traceDetail.allMessages).filter(isTraceSearchSemanticMessage),
      (message) =>
        Effect.gen(function* () {
          const canonicalText = canonicalizeMessageForEmbedding({ role: message.role, text: message.text })
          const contentHash = yield* hashMessageContent({ role: message.role, text: message.text })
          return {
            ...message,
            canonicalText,
            contentHash,
            isOutput: message.index >= outputStartIndex,
          }
        }),
    )

    if (hashedMessages.length === 0) {
      logger.info(`Trace ${traceId} produced no semantic embedding messages, skipping semantic index`)
      return
    }

    const embeddingConfig = yield* resolveEmbeddingConfig().pipe(
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.warn("Trace search embedding configuration invalid; skipping semantic vectors", error),
        ),
      ),
      Effect.orElseSucceed(() => undefined),
    )
    const budget = yield* TraceSearchBudget
    const uniqueMessages = uniqueMessagesByHash(hashedMessages)
    const existing = yield* messageEmbeddingRepo.findByHashes({
      organizationId: OrganizationId(organizationId),
      projectId: ProjectId(projectId),
      contentHashes: uniqueMessages.map((message) => message.contentHash),
      ...(embeddingConfig ? { embeddingModel: embeddingConfig.model } : {}),
    })
    const existingHashes = new Set(embeddingConfig ? existing.map((row) => row.contentHash) : [])
    const misses = embeddingConfig ? uniqueMessages.filter((message) => !existingHashes.has(message.contentHash)) : []

    let embeddedCount = 0
    const skippedDuplicate = uniqueMessages.length - misses.length

    if (embeddingConfig && misses.length > 0) {
      const estimatedTokens = estimateEmbeddingTokens(misses.map((message) => message.canonicalText))
      const budgetOk = yield* budget.tryConsume(OrganizationId(organizationId), estimatedTokens).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => logger.warn(`Embed budget check failed for org ${organizationId}`, error)),
        ),
        Effect.orElseSucceed(() => true),
      )

      if (!budgetOk) {
        logger.info(
          `Org ${organizationId} over embed budget (est ${estimatedTokens} tokens); storing occurrences without embedding ${misses.length} missing messages for trace ${traceId}`,
        )
      } else {
        const rows = yield* Effect.forEach(misses, (message) =>
          Effect.gen(function* () {
            const embedding = yield* generateEmbedding(message.canonicalText, embeddingConfig)
            if (embedding.length === 0) {
              logger.warn(`Failed to generate embedding for trace ${traceId} message ${message.index}, skipping vector`)
              return null
            }
            embeddedCount++
            return {
              organizationId: OrganizationId(organizationId),
              projectId: ProjectId(projectId),
              contentHash: message.contentHash,
              embedding,
              embeddingModel: embeddingConfig.model,
            } satisfies MessageEmbeddingUpsert
          }),
        )
        yield* messageEmbeddingRepo.upsertMany(rows.filter((row) => row !== null))
      }
    }

    yield* traceSearchRepo.upsertMessageOccurrences(
      hashedMessages.map((message) => ({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(projectId),
        traceId: TraceId(traceId),
        messageIndex: message.index,
        contentHash: message.contentHash,
        sessionId: traceDetail.sessionId,
        startTime,
        role: message.role,
        isOutput: message.isOutput,
        retentionDays,
      })),
    )

    logger.info(
      `Indexed semantic search messages for trace ${traceId}: ${embeddedCount} embedded, ${skippedDuplicate} hash hits, ${hashedMessages.length} occurrences`,
    )

    const hasEmbeddings = shouldRetriggerSignalsMatch({
      embeddingConfigResolved: embeddingConfig != null,
      existingCount: existing.length,
      embeddedCount,
    })
    if (hasEmbeddings && publisher) {
      yield* publisher
        .publish(
          "signals",
          "match",
          { organizationId, projectId, traceId, reason: "embeddings-ready" },
          { dedupeKey: `org:${organizationId}:signals-match-embeddings-ready:${projectId}:${traceId}` },
        )
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => logger.info(`Re-triggered signals:match for trace ${traceId} after embeddings landed`)),
          ),
          Effect.catch((error) =>
            Effect.sync(() => logger.error(`Failed to re-trigger signals:match for trace ${traceId}`, error)),
          ),
        )
    }
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
  publisher,
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
        publisher,
      }),
  })
}

export const runTraceSearchRefresh = (payload: RefreshTracePayload, deps: TraceSearchRunDeps) => {
  const clickhouseClient = deps.clickhouseClient
  const postgresClient = deps.postgresClient
  const redisClient = deps.redisClient
  const budgetLayer = Layer.provide(TraceSearchBudgetLive(redisClient), EmbedBudgetResolverLive)

  return processRefreshTrace(payload, deps.publisher).pipe(
    withPostgres(
      Layer.mergeAll(
        BillingOverrideRepositoryLive,
        ProjectRepositoryLive,
        SettingsReaderLive,
        StripeSubscriptionLookupLive,
        OrganizationRepositoryLive,
      ),
      postgresClient,
      OrganizationId(payload.organizationId),
    ),
    withClickHouse(
      Layer.mergeAll(TraceRepositoryLive, TraceSearchRepositoryLive, MessageEmbeddingRepositoryLive),
      clickhouseClient,
      OrganizationId(payload.organizationId),
    ),
    withAi(AIEmbedLive, redisClient),
    Effect.provide(Layer.mergeAll(RedisCacheStoreLive(redisClient), budgetLayer)),
    withTracing,
    Effect.asVoid,
  )
}
