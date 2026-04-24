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
import { getQueueStrategy, hasQueueStrategy, isLlmCapableStrategy } from "../flagger-strategies/index.ts"

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
 * LLM classification for an already-loaded trace.
 *
 * The deterministic phase runs earlier in the trace-end worker (not here). By the
 * time this use-case is invoked — via the Temporal workflow started downstream —
 * the trace was either sampled-in on `no-match` or rate-limited through on
 * `ambiguous`. Either way, the job is pure LLM classification.
 */
export const classifyTraceForQueueUseCase = Effect.fn("annotationQueues.classifyTraceForQueue")(function* (
  input: ClassifyTraceForQueueInput,
) {
  const strategy = getQueueStrategy(input.queueSlug)

  if (!strategy || !isLlmCapableStrategy(strategy) || !strategy.hasRequiredContext(input.trace)) {
    return { matched: false }
  }

  const ai = yield* AI

  const decisions = yield* ai
    .generate({
      ...SYSTEM_QUEUE_FLAGGER_MODEL,
      maxTokens: SYSTEM_QUEUE_FLAGGER_MAX_TOKENS,
      // biome-ignore lint/style/noNonNullAssertion: isLlmCapableStrategy guarantees these are defined
      system: strategy.buildSystemPrompt!(input.trace),
      // biome-ignore lint/style/noNonNullAssertion: isLlmCapableStrategy guarantees these are defined
      prompt: strategy.buildPrompt!(input.trace),
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
    .pipe(
      Effect.map((result) => result.object),
      Effect.catchIf(
        (error): error is AIError => error instanceof AIError && isSchemaMismatchCause(error.cause),
        () =>
          Effect.gen(function* () {
            yield* Effect.annotateCurrentSpan("queue.flaggerSchemaMismatch", true)
            return { matched: false }
          }),
      ),
    )

  return { matched: decisions.matched } satisfies RunSystemQueueFlaggerResult
})

/**
 * Load the trace via the repository, then classify it.
 *
 * Production entry point for the Temporal activity. Short-circuits BEFORE
 * hitting ClickHouse if the queue slug has no registered strategy, no LLM
 * capability, or context is missing.
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

  const strategy = getQueueStrategy(input.queueSlug)
  if (!strategy || !isLlmCapableStrategy(strategy)) {
    return { matched: false }
  }

  const trace = yield* loadTraceDetail(input)
  return yield* classifyTraceForQueueUseCase({ ...input, trace })
})
