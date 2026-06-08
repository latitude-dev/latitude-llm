import { AI } from "@domain/ai"
import {
  analyzeSessionUseCase,
  CONVERSATION_INTELLIGENCE_DETECTOR_VERSION,
  CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
  CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
  CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH,
  SessionAnalysisRepository,
  segmentSemanticMoments,
} from "@domain/conversation-intelligence"
import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { SessionRepository } from "@domain/spans"
import type { TaxonomyDimension } from "@domain/taxonomy"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import { AIEmbedLive } from "@platform/ai-voyage"
import { RedisDistributedLockRepositoryLive } from "@platform/cache-redis"
import {
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
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

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

const sessionConversationMessages = (session: {
  readonly systemInstructions: unknown
  readonly lastInputMessages: readonly unknown[]
  readonly outputMessages: readonly unknown[]
}): readonly unknown[] => {
  const systemMessage =
    Array.isArray(session.systemInstructions) && session.systemInstructions.length > 0
      ? [{ role: "system", parts: session.systemInstructions }]
      : []
  return [...systemMessage, ...session.lastInputMessages, ...session.outputMessages]
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

export interface AnalyzeSessionSegmentationActivityResult {
  readonly segments: readonly {
    readonly firstTurnIndex: number
    readonly lastTurnIndex: number
    readonly turnIndexes: readonly number[]
    readonly centroidEmbedding: readonly number[]
    readonly coherenceScore: number
    readonly boundaryReason: string
  }[]
}

export interface AnalyzeSessionProjectionActivityResult {
  readonly projections: readonly {
    readonly segmentIndex: number
    readonly dimension: TaxonomyDimension
    readonly projectionMethod: string
    readonly embedding: readonly number[]
    readonly sourceTurnIndexes: readonly number[]
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
      ),
      getClickhouseClient(),
      OrganizationId(organizationId),
    ),
  )

const withAnalyzeSessionAi = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(withAi(Layer.mergeAll(AIGenerateLive, AIEmbedLive), getRedisClient()))

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

export const embedAnalyzeSessionTurnsActivity = (input: AnalyzeSessionHashActivityResult) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const ai = yield* AI
      const turns = yield* Effect.forEach(
        input.messages.filter((message) => message.role !== "tool"),
        (message) =>
          ai
            .embed({
              text: `${message.role}: ${message.text}`,
              model: CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
              dimensions: CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
              inputType: "document",
            })
            .pipe(
              Effect.map((result) => ({
                index: message.index,
                role: message.role,
                content: message.text,
                embedding: result.embedding,
              })),
            ),
      )
      return { turns } satisfies AnalyzeSessionEmbeddingActivityResult
    }).pipe(withAnalyzeSessionAi, withTracing),
  )

export const segmentAnalyzeSessionActivity = async (
  input: AnalyzeSessionEmbeddingActivityResult,
): Promise<AnalyzeSessionSegmentationActivityResult> => ({
  segments: segmentSemanticMoments({ turns: input.turns }).map((segment) => ({
    firstTurnIndex: segment.firstTurnIndex,
    lastTurnIndex: segment.lastTurnIndex,
    turnIndexes: segment.turnIndexes,
    centroidEmbedding: segment.centroidEmbedding,
    coherenceScore: segment.coherenceScore,
    boundaryReason: segment.boundaryReason,
  })),
})

const workflowVectorMagnitude = (vector: readonly number[]): number =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))

const workflowCosineSimilarity = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  const denominator = workflowVectorMagnitude(a) * workflowVectorMagnitude(b)
  if (denominator === 0) return 0
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0) / denominator
}

const workflowWeightedMean = (turns: AnalyzeSessionEmbeddingActivityResult["turns"]): readonly number[] => {
  const first = turns[0]?.embedding
  if (!first) return []
  const totals = new Array(first.length).fill(0) as number[]
  let totalWeight = 0
  for (const turn of turns) {
    const weight = Math.max(1, turn.content.trim().length)
    totalWeight += weight
    for (let index = 0; index < first.length; index++) totals[index] += (turn.embedding[index] ?? 0) * weight
  }
  return totalWeight === 0 ? [] : totals.map((total) => total / totalWeight)
}

const WORKFLOW_LABEL_ANCHORS = [
  "the user wants a human agent or manager to take over",
  "the user is uncertain or confused about what to do next and asks for reassurance or guidance",
  "the user gives up withdraws the request or abandons the current goal",
  "the user expresses frustration annoyance or anger about the situation or the assistant's answers",
  "the user expresses satisfaction gratitude or confirms the help solved their problem",
  "the user's issue is resolved completed or successfully answered",
  "the assistant refuses a request because of policy safety or permissions",
  "the conversation is stuck in repeated clarification questions or missing information",
] as const

export const detectAnalyzeSessionLabelsActivity = (
  input: AnalyzeSessionEmbeddingActivityResult & AnalyzeSessionSegmentationActivityResult,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const ai = yield* AI
      const anchors = yield* Effect.forEach(WORKFLOW_LABEL_ANCHORS, (text) =>
        ai
          .embed({
            text,
            model: CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
            dimensions: CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
            inputType: "document",
          })
          .pipe(Effect.map((result) => result.embedding)),
      )
      const turnsByIndex = new Map(input.turns.map((turn) => [turn.index, turn] as const))
      const momentCount = input.segments.filter((segment) => {
        const turns = segment.turnIndexes.flatMap((index) => {
          const turn = turnsByIndex.get(index)
          return turn ? [turn] : []
        })
        const centroid = workflowWeightedMean(turns)
        return anchors.some((anchor) => workflowCosineSimilarity(centroid, anchor) >= 0.58)
      }).length
      return { momentCount }
    }).pipe(withAnalyzeSessionAi, withTracing),
  )

export const persistAnalyzeSessionActivity = (input: AnalyzeSessionActivityInput) => analyzeSessionActivity(input)

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
        ),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withPostgres(TaxonomyClusterRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      Effect.provide(RedisDistributedLockRepositoryLive(getRedisClient())),
      withAi(Layer.mergeAll(AIGenerateLive, AIEmbedLive), getRedisClient()),
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
