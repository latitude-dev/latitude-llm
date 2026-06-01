import { OrganizationId, ProjectId, SessionId, TaxonomyClusterId, TraceId } from "@domain/shared"
import { SessionRepository, TraceRepository } from "@domain/spans"
import { hash } from "@repo/utils"
import { Effect } from "effect"
import {
  TAXONOMY_CLUSTER_LOCK_MAX_RETRIES,
  TAXONOMY_CLUSTER_LOCK_RETRY_BASE_DELAY_MS,
  TAXONOMY_CLUSTER_LOCK_RETRY_MAX_DELAY_MS,
  TAXONOMY_EMBEDDING_MODEL,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_SESSION_MIN_LENGTH,
  TAXONOMY_SUMMARY_MIN_SESSION_TOKENS,
  TAXONOMY_SUMMARY_STRATEGY,
  type TaxonomySummaryStrategy,
} from "../constants.ts"
import { buildSessionDocument } from "../helpers.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import {
  type AssignObservationToClusterInput,
  assignObservationToClusterUseCase,
} from "./assign-observation-to-cluster.ts"
import { decideClusterAssignmentUseCase } from "./decide-cluster-assignment.ts"
import { embedBehaviorSummaryUseCase } from "./embed-behavior-summary.ts"
import { findNearestClustersUseCase } from "./find-nearest-clusters.ts"
import { summarizeBehaviorUseCase } from "./summarize-behavior.ts"

export interface RecordSessionObservationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly triggeringTraceId?: string
  readonly triggeringStartTime?: string
  readonly retentionDays?: number
  /** Test/operator override; defaults to TAXONOMY_SUMMARY_STRATEGY. */
  readonly summaryStrategy?: TaxonomySummaryStrategy
  /**
   * Test/operator override for the lock-contention backoff. `delayMs` is the
   * exponential base delay; the per-attempt cap stays
   * `TAXONOMY_CLUSTER_LOCK_RETRY_MAX_DELAY_MS`. Pass `delayMs: 0` to disable
   * sleeping (deterministic tests).
   */
  readonly clusterLockRetry?: {
    readonly maxRetries: number
    readonly delayMs: number
  }
}

export type RecordSessionObservationResult =
  | { readonly action: "skipped"; readonly reason: "session-not-found" | "empty-session" }
  | {
      readonly action: "recorded"
      readonly assignmentMethod: "noise" | "centroid_online"
      readonly clusterId: string | null
      readonly confidence: number
    }

const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

const parseTraceIds = (traceIds: readonly string[], fallback?: string): TraceId[] => {
  const parsed = traceIds.filter((traceId) => traceId.length === 32).map(TraceId)
  if (parsed.length === 0 && fallback && fallback.length === 32) return [TraceId(fallback)]
  return parsed
}

const backoffDelayWithJitter = (input: { baseDelayMs: number; maxDelayMs: number; attempt: number }) =>
  Effect.sync(() => {
    const exponential = Math.min(input.maxDelayMs, input.baseDelayMs * 2 ** input.attempt)
    return Math.floor(Math.random() * (Math.max(0, exponential) + 1))
  }).pipe(Effect.flatMap((durationMs) => Effect.sleep(`${durationMs} millis`)))

const assignObservationToClusterWithBackoff = Effect.fn(function* (
  input: AssignObservationToClusterInput & {
    readonly sessionId: SessionId
    readonly maxRetries: number
    readonly baseDelayMs: number
    readonly maxDelayMs: number
  },
) {
  let attempt = 0

  while (true) {
    const result = yield* assignObservationToClusterUseCase(input).pipe(
      Effect.as(true as const),
      Effect.catchTag("TaxonomyClusterLockUnavailableError", (error) => Effect.succeed({ error } as const)),
    )

    if (result === true) return true

    if (attempt >= input.maxRetries) {
      yield* Effect.logWarning("Taxonomy cluster lock unavailable; recording observation as noise", {
        organizationId: input.organizationId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        clusterId: input.clusterId,
        error: result.error,
      })
      return false
    }

    yield* backoffDelayWithJitter({ baseDelayMs: input.baseDelayMs, maxDelayMs: input.maxDelayMs, attempt })
    attempt++
  }
})

export const recordSessionObservationUseCase = Effect.fn("taxonomy.recordSessionObservation")(function* (
  input: RecordSessionObservationInput,
) {
  yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("taxonomy.sessionId", input.sessionId)

  const organizationId = OrganizationId(input.organizationId)
  const projectId = ProjectId(input.projectId)
  const sessionId = SessionId(input.sessionId)
  const sessions = yield* SessionRepository
  const traces = yield* TraceRepository
  const observations = yield* BehaviorObservationRepository

  const session = yield* sessions
    .findBySessionId({ organizationId, projectId, sessionId })
    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

  if (session === null)
    return { action: "skipped", reason: "session-not-found" } satisfies RecordSessionObservationResult

  const traceIds = parseTraceIds(session.traceIds, input.triggeringTraceId)
  const traceDetails = traceIds.length > 0 ? yield* traces.listByTraceIds({ organizationId, projectId, traceIds }) : []
  const sessionMessages =
    traceDetails.length > 0
      ? [...traceDetails]
          .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
          .flatMap((trace) => trace.allMessages)
      : [...session.lastInputMessages, ...session.outputMessages]
  const document = buildSessionDocument({
    sessionId: input.sessionId,
    messages: sessionMessages,
    traceIds,
  })

  if (document.conversationText.length === 0) {
    return { action: "skipped", reason: "empty-session" } satisfies RecordSessionObservationResult
  }

  const summaryHash = yield* hash(`${input.sessionId}\0${document.conversationText}`)
  const now = new Date()
  const retentionDays = input.retentionDays ?? TAXONOMY_OBSERVATION_RETENTION_DAYS

  if (document.conversationText.length < TAXONOMY_SESSION_MIN_LENGTH) {
    yield* observations.upsert({
      organizationId,
      projectId,
      sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      traceIds,
      summary: document.summaryPreview,
      summaryHash,
      // Deliberately excluded from gardening birth sweeps: short sessions do
      // not have enough behavioral signal to justify an embedding.
      embedding: [],
      embeddingModel: TAXONOMY_EMBEDDING_MODEL,
      assignedClusterId: null,
      assignmentConfidence: 0,
      assignmentMethod: "noise",
      reassignmentRunId: null,
      retentionDays,
      indexedAt: now,
    })
    return {
      action: "recorded",
      assignmentMethod: "noise",
      clusterId: null,
      confidence: 0,
    } satisfies RecordSessionObservationResult
  }

  let summary = document.summaryPreview
  let textToEmbed = document.conversationText

  const summaryStrategy = input.summaryStrategy ?? TAXONOMY_SUMMARY_STRATEGY
  if (summaryStrategy === "llm" && estimateTokens(document.conversationText) >= TAXONOMY_SUMMARY_MIN_SESSION_TOKENS) {
    const existing = yield* observations.findBySummaryHash({ organizationId, projectId, sessionId, summaryHash })
    if (existing !== null && existing.summary.length > 0) {
      summary = existing.summary
      textToEmbed = existing.summary
    } else {
      const generated = yield* summarizeBehaviorUseCase({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        conversationText: document.conversationText,
      })
      summary = generated.summary
      textToEmbed = generated.summary
    }
  }

  const embedded = yield* embedBehaviorSummaryUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    text: textToEmbed,
  })

  const topK = yield* findNearestClustersUseCase({
    organizationId,
    projectId,
    queryVector: embedded.normalizedEmbedding,
  })
  const decision = yield* decideClusterAssignmentUseCase({ topK })

  let assignedClusterId = decision.clusterId === null ? null : TaxonomyClusterId(decision.clusterId)
  let assignmentMethod = decision.method
  let assignmentConfidence = decision.confidence

  if (decision.method === "centroid_online") {
    const assigned = yield* assignObservationToClusterWithBackoff({
      organizationId,
      projectId,
      sessionId,
      clusterId: decision.clusterId,
      embedding: embedded.normalizedEmbedding,
      observedAt: session.startTime,
      assignedAt: now,
      maxRetries: input.clusterLockRetry?.maxRetries ?? TAXONOMY_CLUSTER_LOCK_MAX_RETRIES,
      baseDelayMs: input.clusterLockRetry?.delayMs ?? TAXONOMY_CLUSTER_LOCK_RETRY_BASE_DELAY_MS,
      maxDelayMs: TAXONOMY_CLUSTER_LOCK_RETRY_MAX_DELAY_MS,
    })

    if (!assigned) {
      assignedClusterId = null
      assignmentMethod = "noise"
      assignmentConfidence = 0
    }
  }

  yield* observations.upsert({
    organizationId,
    projectId,
    sessionId,
    startTime: session.startTime,
    endTime: session.endTime,
    traceIds,
    summary,
    summaryHash,
    embedding: embedded.normalizedEmbedding,
    embeddingModel: embedded.embeddingModel,
    assignedClusterId,
    assignmentConfidence,
    assignmentMethod,
    reassignmentRunId: null,
    retentionDays,
    indexedAt: now,
  })

  return {
    action: "recorded",
    assignmentMethod,
    clusterId: assignedClusterId,
    confidence: assignmentConfidence,
  } satisfies RecordSessionObservationResult
})
