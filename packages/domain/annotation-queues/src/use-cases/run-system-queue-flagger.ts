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
const runLlmFlagger = (input: RunSystemQueueFlaggerInput, trace: TraceDetail) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const strategy = getQueueStrategy(input.queueSlug)

    if (!strategy) {
      return { matched: false }
    }

    const result = yield* ai.generate({
      ...SYSTEM_QUEUE_FLAGGER_MODEL,
      maxTokens: SYSTEM_QUEUE_FLAGGER_MAX_TOKENS,
      system: strategy.buildSystemPrompt(trace),
      prompt: strategy.buildPrompt(trace),
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

export const runSystemQueueFlaggerUseCase = Effect.fn("annotationQueues.runSystemQueueFlagger")(function* (
  input: RunSystemQueueFlaggerInput,
) {
  yield* Effect.annotateCurrentSpan("queue.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("queue.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("queue.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("queue.queueSlug", input.queueSlug)

  // Check if this is a known queue slug
  if (!hasQueueStrategy(input.queueSlug)) {
    // Unknown slug - short circuit with no match
    return { matched: false }
  }

  const trace = yield* loadTraceDetail(input)
  const strategy = getQueueStrategy(input.queueSlug)

  if (!strategy) {
    return { matched: false }
  }

  // Check if required context is present
  if (!strategy.hasRequiredContext(trace)) {
    return { matched: false }
  }

  // Phase 1: Try deterministic detection if available
  const deterministicResult = runDeterministicDetection(input.queueSlug, trace)

  if (deterministicResult) {
    switch (deterministicResult.kind) {
      case "matched":
        // Deterministic match - queue it immediately without LLM
        return { matched: true }
      case "no-match":
        // Deterministic clean - skip it immediately without LLM
        return { matched: false }
      case "ambiguous":
      // Ambiguous - fall through to LLM
    }
  }

  // Phase 2: LLM fallback for ambiguous cases or strategies without deterministic detection
  const decisions = yield* runLlmFlagger(input, trace).pipe(
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
