import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  AIError,
  buildProjectScopedAiMetadata,
} from "@domain/ai"
import { type NotFoundError, OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { SYSTEM_QUEUE_FLAGGER_MAX_TOKENS, SYSTEM_QUEUE_FLAGGER_MODEL } from "../constants.ts"
import { type DetectionResult, getQueueStrategy, hasQueueStrategy } from "../flagger-strategies/index.ts"

export interface RunSystemQueueFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}

export interface RunSystemQueueFlaggerResult {
  readonly matched: boolean
}

export type RunSystemQueueFlaggerError = NotFoundError | RepositoryError | AIError | AICredentialError

/**
 * Input for the pure classifier (no repository dependency).
 *
 * Callers that already hold a `TraceDetail` — eval harnesses, experiment runners,
 * any non-production code that shouldn't touch Clickhouse — use this shape with
 * {@link classifyTraceForQueueUseCase}.
 */
export interface ClassifyTraceForQueueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
  readonly trace: TraceDetail
}

const systemQueueFlaggerOutputSchema = z.object({
  matched: z.boolean().optional().default(false),
})

const loadTraceDetail = (input: RunSystemQueueFlaggerInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository

    return yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.traceId),
    })
  })

// The Vercel AI SDK raises a `NoObjectGeneratedError` (name `AI_NoObjectGeneratedError`)
// when the model returns output that does not match the requested schema. The flagger
// treats this as a "no match" signal instead of propagating the failure — the model
// effectively failed to classify, which for a triage flagger is indistinguishable
// from matched=false.
const isSchemaMismatchCause = (cause: unknown): boolean => {
  if (!(cause instanceof Error)) return false
  if (cause.name === "AI_NoObjectGeneratedError") return true
  return typeof cause.message === "string" && cause.message.includes("response did not match schema")
}

/**
 * Run LLM flagger with the given strategy.
 */
const runLlmFlagger = (input: ClassifyTraceForQueueInput) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const strategy = getQueueStrategy(input.queueSlug)

    if (!strategy) {
      return { matched: false }
    }

    const result = yield* ai.generate({
      ...SYSTEM_QUEUE_FLAGGER_MODEL,
      maxTokens: SYSTEM_QUEUE_FLAGGER_MAX_TOKENS,
      system: strategy.buildSystemPrompt(input.trace),
      prompt: strategy.buildPrompt(input.trace),
      schema: systemQueueFlaggerOutputSchema,
      telemetry: {
        spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.queueSystemClassify,
        tags: [...AI_GENERATE_TELEMETRY_TAGS.queueSystemClassify],
        metadata: buildProjectScopedAiMetadata(
          { organizationId: input.organizationId, projectId: input.projectId },
          { traceId: input.traceId, queueSlug: input.queueSlug },
        ),
      },
    })

    return result.object
  })

/**
 * Run deterministic detection phase for a queue strategy.
 * Returns the detection result or null if the strategy doesn't support deterministic detection.
 */
function runDeterministicDetection(queueSlug: string, trace: TraceDetail): DetectionResult | null {
  const strategy = getQueueStrategy(queueSlug)
  if (!strategy?.detectDeterministically) {
    return null
  }

  return strategy.detectDeterministically(trace)
}

/**
 * Classify an already-loaded trace for a system queue.
 *
 * This is the pure classifier layer: no data loading, no repository dependency.
 * The deterministic pre-filter runs first; only ambiguous cases fall through to
 * the LLM.
 *
 * Production callers that start from a traceId should use
 * {@link runSystemQueueFlaggerUseCase}, which fetches the trace and then delegates here.
 */
export const classifyTraceForQueueUseCase = Effect.fn("annotationQueues.classifyTraceForQueue")(function* (
  input: ClassifyTraceForQueueInput,
) {
  if (!hasQueueStrategy(input.queueSlug)) {
    return { matched: false }
  }

  const strategy = getQueueStrategy(input.queueSlug)
  if (!strategy) {
    return { matched: false }
  }

  if (!strategy.hasRequiredContext(input.trace)) {
    return { matched: false }
  }

  // Phase 1: Try deterministic detection if available
  const deterministicResult = runDeterministicDetection(input.queueSlug, input.trace)

  if (deterministicResult) {
    switch (deterministicResult.kind) {
      case "matched":
        return { matched: true }
      case "no-match":
        return { matched: false }
      case "ambiguous":
      // Ambiguous — fall through to LLM
    }
  }

  // Phase 2: LLM fallback for ambiguous cases or strategies without deterministic detection
  const decisions = yield* runLlmFlagger(input).pipe(
    Effect.catchIf(
      (error): error is AIError => error instanceof AIError && isSchemaMismatchCause(error.cause),
      () =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan("queue.flaggerSchemaMismatch", true)
          return { matched: false }
        }),
    ),
  )

  return {
    matched: decisions.matched,
  } satisfies RunSystemQueueFlaggerResult
})

/**
 * Load the trace via the repository, then classify it.
 *
 * This is the production entry point — the one called by the Temporal activity
 * in `systemQueueFlaggerWorkflow`. For unknown queue slugs it short-circuits
 * BEFORE hitting the repository, so legacy workflow activations for removed
 * queues don't cost a Clickhouse roundtrip.
 */
export const runSystemQueueFlaggerUseCase = Effect.fn("annotationQueues.runSystemQueueFlagger")(function* (
  input: RunSystemQueueFlaggerInput,
) {
  yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("queue.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("queue.queueSlug", input.queueSlug)

  if (!hasQueueStrategy(input.queueSlug)) {
    return { matched: false }
  }

  const trace = yield* loadTraceDetail(input)
  return yield* classifyTraceForQueueUseCase({ ...input, trace })
})
