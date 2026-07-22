import {
  type AnalyzeSessionResult,
  analyzeSessionUseCase,
  CONVERSATION_INTELLIGENCE_DETECTOR_VERSION,
  CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH,
  resolveTurnEmbeddings,
  SessionAnalysisRepository,
} from "@domain/conversation-intelligence"
import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { SessionRepository, sessionConversationMessages } from "@domain/spans"
import { AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import {
  EmbedBudgetResolverLive,
  RedisDistributedLockRepositoryLive,
  TraceSearchBudgetLive,
} from "@platform/cache-redis"
import {
  MessageEmbeddingRepositoryLive,
  SessionAnalysisRepositoryLive,
  SessionMomentLabelRepositoryLive,
  SessionRepositoryLive,
  SessionSemanticMomentRepositoryLive,
  TaxonomyObservationRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { TaxonomyClusterRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { hash } from "@repo/utils"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getQueuePublisher, getRedisClient } from "../clients.ts"

const logger = createLogger("analyze-session-workflow")

export interface AnalyzeSessionActivityInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly triggeringTraceId: string
  readonly triggeringStartTime: string
  readonly reason: "trace_completed" | "backfill" | "manual_reprocess"
  readonly debounceMs?: number
}

export type AnalyzeSessionActivityResult = Awaited<ReturnType<typeof analyzeSessionActivity>>

interface AnalyzeSessionMessage {
  readonly index: number
  readonly role: "user" | "assistant" | "tool" | "system" | "unknown"
  readonly text: string
}

export interface AnalyzeSessionLoadedActivityResult {
  readonly found: boolean
  readonly rawMessages: readonly unknown[]
}

export interface AnalyzeSessionHashActivityInput
  extends AnalyzeSessionActivityInput,
    AnalyzeSessionLoadedActivityResult {}

export interface AnalyzeSessionHashActivityResult {
  readonly analysisHash: string
  readonly document: string
  readonly messages: readonly AnalyzeSessionMessage[]
  readonly hashCurrent: boolean
}

export interface AnalyzeSessionEligibilityActivityInput
  extends AnalyzeSessionActivityInput,
    AnalyzeSessionLoadedActivityResult,
    AnalyzeSessionHashActivityResult {}

export interface AnalyzeSessionEligibilityActivityResult {
  readonly eligible: boolean
  readonly reason: "hash_current" | "empty" | "too_short" | "non_conversation" | "eligible"
}

export interface AnalyzeSessionEmbeddingActivityResult {
  readonly turns: readonly {
    readonly index: number
    readonly role: AnalyzeSessionMessage["role"]
    readonly content: string
    readonly embedding: readonly number[]
  }[]
}

const roleOf = (message: unknown): AnalyzeSessionMessage["role"] => {
  if (message === null || typeof message !== "object") return "unknown"
  const role = (message as { readonly role?: unknown }).role
  if (role === "user" || role === "assistant" || role === "tool" || role === "system") return role
  return "unknown"
}

const partText = (part: unknown): string => {
  if (part === null || typeof part !== "object") return ""
  const p = part as Record<string, unknown>
  if (typeof p.content === "string") return p.content
  if (p.type === "tool_call" && typeof p.name === "string") return `[TOOL CALL: ${p.name}]`
  if (p.type === "tool_call_response") return typeof p.result === "string" ? p.result : "[TOOL RESULT]"
  return ""
}

const textOf = (message: unknown): string => {
  if (message === null || typeof message !== "object") return ""
  const m = message as { readonly parts?: unknown; readonly content?: unknown }
  if (typeof m.content === "string") return m.content.trim()
  if (!Array.isArray(m.parts)) return ""
  return m.parts.map(partText).filter(Boolean).join("\n").trim()
}

// Mirrors the persist step's normalization (tool telemetry stripped) so the
// embedding cache warm-up produces identical texts.
const stripToolTelemetry = (content: string): string =>
  content
    .split("\n")
    .filter((line) => !line.trim().startsWith("[TOOL CALL:") && line.trim() !== "[TOOL RESULT]")
    .join("\n")
    .trim()

const normalizeMessages = (messages: readonly unknown[]): readonly AnalyzeSessionMessage[] =>
  messages
    .map((message, index) => ({ index, role: roleOf(message), text: stripToolTelemetry(textOf(message)) }))
    .filter((message) => message.text.length > 0)

const documentFromMessages = (messages: readonly AnalyzeSessionMessage[]): string =>
  messages.map((message) => `${message.index}. ${message.role}: ${message.text}`).join("\n\n")

const withAnalyzeSessionClickHouse = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(
    withClickHouse(
      Layer.mergeAll(
        SessionRepositoryLive,
        SessionAnalysisRepositoryLive,
        SessionSemanticMomentRepositoryLive,
        SessionMomentLabelRepositoryLive,
        TaxonomyObservationRepositoryLive,
        MessageEmbeddingRepositoryLive,
      ),
      getClickhouseClient(),
      OrganizationId(organizationId),
    ),
  )

const withAnalyzeSessionAi = <A, E, R>(effect: Effect.Effect<A, E, R>, organizationId: string) =>
  effect.pipe(withAi(Layer.mergeAll(AIGenerateLive, AIEmbedLive), getRedisClient(), { organizationId }))

const withAnalyzeSessionEmbeddingBudget = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(Layer.provide(TraceSearchBudgetLive(getRedisClient()), EmbedBudgetResolverLive)))

export const loadAnalyzeSessionActivity = (input: AnalyzeSessionActivityInput) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const organizationId = OrganizationId(input.organizationId)
      const projectId = ProjectId(input.projectId)
      const sessionId = SessionId(input.sessionId)
      const sessions = yield* SessionRepository
      const session = yield* sessions
        .findBySessionId({ organizationId, projectId, sessionId })
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (session === null) return { found: false, rawMessages: [] } satisfies AnalyzeSessionLoadedActivityResult
      const rawMessages = sessionConversationMessages(session)
      return { found: true, rawMessages } satisfies AnalyzeSessionLoadedActivityResult
    }).pipe((effect) => withAnalyzeSessionClickHouse(effect, input.organizationId), withTracing),
  )

export const hashAnalyzeSessionActivity = (input: AnalyzeSessionHashActivityInput) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const organizationId = OrganizationId(input.organizationId)
      const projectId = ProjectId(input.projectId)
      const sessionId = SessionId(input.sessionId)
      const messages = normalizeMessages(input.rawMessages)
      const document = documentFromMessages(messages)
      const analysisHash = yield* hash(`${CONVERSATION_INTELLIGENCE_DETECTOR_VERSION}\0${sessionId}\0${document}`)
      const analyses = yield* SessionAnalysisRepository
      const latest = yield* analyses.findLatest({ organizationId, projectId, sessionId })
      return {
        analysisHash,
        document,
        messages,
        hashCurrent: latest?.analysisHash === analysisHash && latest.analysisStatus !== "failed",
      } satisfies AnalyzeSessionHashActivityResult
    }).pipe((effect) => withAnalyzeSessionClickHouse(effect, input.organizationId), withTracing),
  )

export const checkAnalyzeSessionEligibilityActivity = async (
  input: AnalyzeSessionEligibilityActivityInput,
): Promise<AnalyzeSessionEligibilityActivityResult> => {
  if (!input.found) return { eligible: false, reason: "empty" }
  if (input.hashCurrent) return { eligible: false, reason: "hash_current" }
  if (input.messages.length === 0 || input.document.length === 0) return { eligible: false, reason: "empty" }
  if (input.document.length < CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH)
    return { eligible: false, reason: "too_short" }
  const hasUser = input.messages.some((message) => message.role === "user")
  const hasAssistant = input.messages.some((message) => message.role === "assistant")
  if (!hasUser || !hasAssistant) return { eligible: false, reason: "non_conversation" }
  return { eligible: true, reason: "eligible" }
}

export const embedAnalyzeSessionTurnsActivity = (
  input: AnalyzeSessionActivityInput & AnalyzeSessionHashActivityResult,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const turns = yield* resolveTurnEmbeddings({
        organizationId: OrganizationId(input.organizationId),
        projectId: ProjectId(input.projectId),
        messages: input.messages,
      })
      return { turns } satisfies AnalyzeSessionEmbeddingActivityResult
    }).pipe(
      (effect) => withAnalyzeSessionClickHouse(effect, input.organizationId),
      (effect) => withAnalyzeSessionAi(effect, input.organizationId),
      withAnalyzeSessionEmbeddingBudget,
      withTracing,
    ),
  )

// Deprecated warm-up activities. They no longer warm anything — the persist
// activity re-runs the full use case — and exist only so executions started
// before the `analyze-session-drop-segment-label-warmup-v1` workflow patch can
// replay their recorded embed→segment→label→persist command sequence without a
// non-determinism error. Remove together with the patch once no pre-patch
// executions remain.
export const segmentAnalyzeSessionActivity = async (
  _input: AnalyzeSessionEmbeddingActivityResult,
): Promise<{ readonly replayed: true }> => ({ replayed: true })

export const detectAnalyzeSessionLabelsActivity = async (
  _input: AnalyzeSessionEmbeddingActivityResult,
): Promise<{ readonly replayed: true }> => ({ replayed: true })

export const persistAnalyzeSessionActivity = (input: AnalyzeSessionActivityInput) => analyzeSessionActivity(input)

/**
 * Chains flagger screening onto every recorded generation, including skipped/
 * failed analyses (short sessions still deserve screening; hints degrade to
 * none) — but not backfill/reprocess (would trigger a flagging/billing storm).
 * Best-effort: a queue failure never fails the persist. The dedupe key MUST
 * include the analysis hash — a bare per-session jobId shadows later generations.
 */
const publishFlaggerScreening = (
  input: AnalyzeSessionActivityInput,
  result: AnalyzeSessionResult,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (input.reason !== "trace_completed") return
    if (result.action !== "recorded") return

    const publisher = yield* Effect.promise(() => getQueuePublisher())
    yield* publisher.publish(
      "flagger-screening",
      "start",
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        analysisHash: result.analysisHash,
      },
      {
        dedupeKey: `org:${input.organizationId}:flagger-screening:${input.projectId}:${input.sessionId}:${result.analysisHash}`,
      },
    )
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() =>
        logger.error("Failed to enqueue flagger screening", {
          organizationId: input.organizationId,
          projectId: input.projectId,
          sessionId: input.sessionId,
          reason: input.reason,
          error,
        }),
      ),
    ),
  )

export const analyzeSessionActivity = (input: AnalyzeSessionActivityInput) => {
  const startedAt = Date.now()
  return Effect.runPromise(
    analyzeSessionUseCase(input).pipe(
      withClickHouse(
        Layer.mergeAll(
          SessionRepositoryLive,
          SessionAnalysisRepositoryLive,
          SessionSemanticMomentRepositoryLive,
          SessionMomentLabelRepositoryLive,
          TaxonomyObservationRepositoryLive,
          MessageEmbeddingRepositoryLive,
        ),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withPostgres(TaxonomyClusterRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      Effect.provide(RedisDistributedLockRepositoryLive(getRedisClient())),
      withAnalyzeSessionEmbeddingBudget,
      withAi(Layer.mergeAll(AIGenerateLive, AIEmbedLive), getRedisClient(), { organizationId: input.organizationId }),
      Effect.tap((result) => publishFlaggerScreening(input, result)),
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.info("AnalyzeSessionWorkflow activity completed", {
            metric: "conversationIntelligence.analyzeSessionWorkflow.activity",
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            reason: input.reason,
            durationMs: Date.now() - startedAt,
            result,
          }),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logger.error("AnalyzeSessionWorkflow activity failed", {
            metric: "conversationIntelligence.analyzeSessionWorkflow.activity",
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            reason: input.reason,
            durationMs: Date.now() - startedAt,
            error,
          }),
        ),
      ),
      withTracing,
    ),
  )
}
