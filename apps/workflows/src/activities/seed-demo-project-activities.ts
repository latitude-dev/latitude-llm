import { AI, resolveEmbeddingConfig } from "@domain/ai"
import { ApiKeyId, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { createSeedScope, type SeedScope } from "@domain/shared/seeding"
import {
  buildTraceSearchDocument,
  canonicalizeMessageForEmbedding,
  extractTraceSearchEmbeddingMessages,
  hashMessageContent,
  isTraceSearchSemanticMessage,
  MessageEmbeddingRepository,
  type MessageEmbeddingUpsert,
  TraceRepository,
  TraceSearchRepository,
} from "@domain/spans"
import { AIEmbedLive, withAi } from "@platform/ai"
import {
  MessageEmbeddingRepositoryLive,
  queryClickhouse,
  TraceRepositoryLive,
  TraceSearchRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { seedDemoProjectClickHouse } from "@platform/db-clickhouse/seeding"
import { seedDemoProjectPostgres } from "@platform/db-postgres/seeding"
import { Context as ActivityContext } from "@temporalio/activity"
import { Effect, Layer } from "effect"
import { getAdminPostgresClient, getClickhouseClient, getRedisClient } from "../clients.ts"
import { importDemoProjectDerivedSnapshot } from "./demo-project-snapshot.ts"

/**
 * Plain-data input that the workflow hands every activity. Workflow code
 * must be deterministic across replays, so the api-key lookup happens in
 * the request handler (server function → use-case) and arrives here as a
 * plain string.
 *
 * `timelineAnchorIso` is captured at workflow-start time so both
 * datastores end up with seeded rows pinned to the same "now". Using
 * `new Date()` inside an activity would drift between retries.
 */
export interface SeedDemoProjectActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly apiKeyId: string
  readonly timelineAnchorIso: string
}

const buildScope = (input: SeedDemoProjectActivityInput): SeedScope =>
  createSeedScope({
    organizationId: OrganizationId(input.organizationId),
    projectId: ProjectId(input.projectId),
    timelineAnchor: new Date(input.timelineAnchorIso),
    apiKeyId: ApiKeyId(input.apiKeyId),
  })

/**
 * Postgres content seed: datasets, evaluations, issues, simulations,
 * scores.
 *
 * Bootstrap-only seeders (org/users/api-keys/projects rows) are
 * intentionally skipped — the demo path operates on an existing org
 * with an existing API key, and the project row was created by the
 * use-case before this workflow started.
 *
 * Uses the admin (RLS-bypass) postgres client for the same reason
 * `pnpm seed` does: the seeders write across many tables guarded by
 * `organization_id = get_current_organization_id()` policies via the
 * bare drizzle client (no `SqlClient.transaction` to set the RLS
 * context), so the standard role's policies would reject every
 * insert. Same trade-off the bootstrap CLI already makes.
 */
export const seedDemoProjectPostgresActivity = (input: SeedDemoProjectActivityInput): Promise<void> =>
  seedDemoProjectPostgres({ client: getAdminPostgresClient(), scope: buildScope(input) })

/**
 * ClickHouse content seed: ambient telemetry (~30 days × 6 agents),
 * deterministic span fixtures, score-mirror rows, dataset rows.
 * Depends on the Postgres seed (issue / evaluation / score ids) only by
 * way of the shared `SeedScope` — both sides resolve through the same
 * keys.
 */
export const seedDemoProjectClickHouseActivity = (input: SeedDemoProjectActivityInput): Promise<void> =>
  seedDemoProjectClickHouse({ client: getClickhouseClient(), scope: buildScope(input) })

export const seedDemoProjectDerivedSnapshotActivity = (input: SeedDemoProjectActivityInput): Promise<void> =>
  importDemoProjectDerivedSnapshot({
    postgresClient: getAdminPostgresClient(),
    clickhouseClient: getClickhouseClient(),
    scope: buildScope(input),
  })

type DemoTraceRow = {
  readonly trace_id: string
  readonly start_time_ms: number | string
  readonly root_span_name: string
}

// Hardcoded rather than resolved from org settings so demo rows never expire per-tenant config.
const DEMO_PROJECT_RETENTION_DAYS = 30

/**
 * Embedding every seeded trace is the long pole of the demo seed. The
 * production trace-search worker gets parallelism for free (one queue job
 * per trace, processed across the worker pool); here every trace is indexed
 * inside a single activity, so we fan out across traces with a bounded
 * concurrency instead of awaiting each in turn. Chunks within a trace stay
 * sequential — trace count (hundreds to thousands) dominates, so trace-level
 * parallelism is where the win is, and processing one chunk at a time per
 * trace keeps in-flight Voyage calls ~equal to this bound rather than
 * `bound × chunks`. The Voyage adapter has no rate-limit guard, so this is
 * the only throttle on the embedding fan-out.
 */
const SEED_TRACE_SEARCH_CONCURRENCY = 8

const uniqueMessagesByHash = <T extends { readonly contentHash: string }>(messages: readonly T[]): readonly T[] => {
  const byHash = new Map<string, T>()
  for (const message of messages) {
    if (!byHash.has(message.contentHash)) byHash.set(message.contentHash, message)
  }
  return [...byHash.values()]
}

/**
 * Emit a Temporal activity heartbeat, no-op when not running inside an
 * activity (unit tests, the local seed-repro path). `Context.current()`
 * throws outside activity execution, so the guard keeps the same effect
 * usable in both places. Paired with the workflow's `heartbeatTimeout`, a
 * heartbeat per completed trace lets Temporal detect a dead worker in
 * seconds instead of waiting out the 30-minute start-to-close timeout.
 */
const heartbeat = (details: string): Effect.Effect<void> =>
  Effect.sync(() => {
    try {
      ActivityContext.current().heartbeat(details)
    } catch {
      // Not inside a Temporal activity — nothing to heartbeat.
    }
  })

const listSeededTraceRows = (input: SeedDemoProjectActivityInput) =>
  queryClickhouse<DemoTraceRow>(
    getClickhouseClient(),
    `SELECT
       CAST(trace_id AS String) AS trace_id,
       toUnixTimestamp64Milli(min(min_start_time)) AS start_time_ms,
       argMinIfMerge(root_span_name) AS root_span_name
     FROM traces
     WHERE organization_id = {organizationId:String}
       AND project_id = {projectId:String}
     GROUP BY trace_id
     ORDER BY start_time_ms ASC, trace_id ASC`,
    { organizationId: input.organizationId, projectId: input.projectId },
  )

/**
 * Derived trace-search seed: creates the lexical document and semantic
 * embeddings that the behaviour/search page reads. This intentionally uses
 * the same domain document builder, trace repository, and Voyage embedding
 * provider as the trace-search worker so demo projects exercise the real
 * search path instead of fixture-only rows.
 */
export const seedDemoProjectTraceSearchActivity = (input: SeedDemoProjectActivityInput): Promise<void> => {
  const clickhouse = getClickhouseClient()
  const redis = getRedisClient()
  const organizationId = OrganizationId(input.organizationId)
  const projectId = ProjectId(input.projectId)

  return Effect.runPromise(
    Effect.gen(function* () {
      const traceRows = yield* listSeededTraceRows(input)
      // Heartbeat once up front: the per-trace heartbeats below only start
      // firing after the first trace finishes, so without this the heartbeat
      // clock would have to cover `listSeededTraceRows` + the first trace's
      // embeds before any signal — a slow start could trip `heartbeatTimeout`
      // on attempt 1 even though nothing is wrong.
      yield* heartbeat("start")
      const traceRepo = yield* TraceRepository
      const searchRepo = yield* TraceSearchRepository
      const messageEmbeddingRepo = yield* MessageEmbeddingRepository
      const ai = yield* AI

      const indexTrace = (row: DemoTraceRow) =>
        Effect.gen(function* () {
          const traceId = TraceId(row.trace_id)
          const startTimeMs = typeof row.start_time_ms === "string" ? Number(row.start_time_ms) : row.start_time_ms
          const startTime = new Date(startTimeMs)
          const trace = yield* traceRepo.findByTraceId({ organizationId, projectId, traceId })
          if (trace.allMessages.length === 0) {
            yield* heartbeat(row.trace_id)
            return
          }

          const document = yield* buildTraceSearchDocument({
            traceId,
            startTime,
            rootSpanName: row.root_span_name,
            messages: trace.allMessages,
          })

          yield* searchRepo.upsertDocument({
            organizationId,
            projectId,
            traceId,
            startTime,
            rootSpanName: document.rootSpanName,
            searchText: document.searchText,
            contentHash: document.contentHash,
            retentionDays: DEMO_PROJECT_RETENTION_DAYS,
          })

          const outputStartIndex = trace.allMessages.length - trace.outputMessages.length
          const hashedMessages = yield* Effect.forEach(
            extractTraceSearchEmbeddingMessages(trace.allMessages).filter(isTraceSearchSemanticMessage),
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
          const uniqueMessages = uniqueMessagesByHash(hashedMessages)
          const embeddingConfig = yield* resolveEmbeddingConfig().pipe(
            Effect.tapError((error) =>
              Effect.logWarning("demo-project trace-search embedding configuration invalid; skipping vectors", error),
            ),
            Effect.orElseSucceed(() => undefined),
          )
          const existing = yield* messageEmbeddingRepo.findByHashes({
            organizationId,
            projectId,
            contentHashes: uniqueMessages.map((message) => message.contentHash),
          })
          const existingHashes = new Set(
            embeddingConfig
              ? existing.filter((row) => row.embeddingModel === embeddingConfig.model).map((row) => row.contentHash)
              : [],
          )
          const misses = embeddingConfig
            ? uniqueMessages.filter((message) => !existingHashes.has(message.contentHash))
            : []
          if (embeddingConfig && misses.length > 0) {
            const embeddingRows = yield* Effect.forEach(misses, (message) =>
              ai
                .embed({
                  text: message.canonicalText,
                  provider: embeddingConfig.provider,
                  model: embeddingConfig.model,
                  inputType: "document",
                  telemetry: {
                    spanName: "demo-project.trace-search.embed",
                    name: "demo-project-trace-search-embed",
                    tags: ["demo-project", "trace-search", "embedding"],
                  },
                })
                .pipe(
                  Effect.map(
                    (result): MessageEmbeddingUpsert => ({
                      organizationId,
                      projectId,
                      contentHash: message.contentHash,
                      embeddingModel: embeddingConfig.model,
                      embedding: result.embedding as readonly number[],
                    }),
                  ),
                  Effect.tapError((err) =>
                    Effect.logWarning("demo-project trace-search embed failed — skipping message", {
                      messageIndex: message.index,
                      error: err,
                    }),
                  ),
                  Effect.orElseSucceed(() => null),
                ),
            )
            yield* messageEmbeddingRepo.upsertMany(embeddingRows.filter((row) => row !== null))
          }
          yield* searchRepo.upsertMessageOccurrences(
            hashedMessages.map((message) => ({
              organizationId,
              projectId,
              traceId,
              messageIndex: message.index,
              startTime,
              contentHash: message.contentHash,
              sessionId: trace.sessionId,
              role: message.role,
              isOutput: message.isOutput,
              retentionDays: DEMO_PROJECT_RETENTION_DAYS,
            })),
          )

          yield* heartbeat(row.trace_id)
        })

      yield* Effect.forEach(traceRows, indexTrace, {
        concurrency: SEED_TRACE_SEARCH_CONCURRENCY,
        discard: true,
      })
    }).pipe(
      withClickHouse(
        Layer.mergeAll(TraceRepositoryLive, TraceSearchRepositoryLive, MessageEmbeddingRepositoryLive),
        clickhouse,
        organizationId,
      ),
      withAi(AIEmbedLive, redis),
    ),
  )
}
