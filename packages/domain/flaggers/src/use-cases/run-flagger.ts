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
import { FLAGGER_MAX_TOKENS, FLAGGER_MODEL } from "../constants.ts"
import { getFlaggerStrategy, hasFlaggerStrategy, isLlmCapableStrategy } from "../flagger-strategies/index.ts"
import type { FlaggerSlug, FlaggerStrategy } from "../flagger-strategies/types.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"

export interface RunFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
}

export interface RunFlaggerResult {
  readonly matched: boolean
  readonly feedback?: string | undefined
  readonly messageIndex?: number | undefined
}

export type RunFlaggerError = NotFoundError | RepositoryError | AIError | AICredentialError

/**
 * Input for the pure classifier (no repository dependency).
 *
 * Callers that already hold a `TraceDetail` — eval harnesses, experiment runners,
 * any non-production code that shouldn't touch Clickhouse — use this shape with
 * {@link classifyTraceForFlaggerUseCase}.
 *
 * `strategyOverride` is the optimizer seam: when present it replaces the
 * registry lookup keyed by `flaggerSlug`, so `tools/ai-benchmarks/benchmark:optimize`
 * can evaluate a candidate strategy file without mutating the global registry.
 * Production never sets this.
 */
export interface ClassifyTraceForFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
  readonly trace: TraceDetail
  readonly strategyOverride?: FlaggerStrategy
}

const selfNegatingFeedbackPattern =
  /\b(?:no\s+(?:[\w-]+\s+){0,6}(?:detected|found|present)|not\s+(?:a|an)?\s*(?:[\w-]+\s+){0,6}(?:issue|problem|violation|jailbreak|refusal|error)|does\s+not\s+(?:show|indicate|contain|demonstrate)|normal\s+(?:software\s+development\s+)?workflow|legitimate\s+(?:request|workflow|behavior)|correctly\s+(?:refused|handled))\b/i

const isSelfNegatingFeedback = (feedback: string): boolean => selfNegatingFeedbackPattern.test(feedback)

const baseFlaggerOutputSchema = z.object({
  matched: z.boolean().optional().default(false),
  feedback: z.string().min(1).nullable().optional(),
  messageIndex: z.number().int().nonnegative().optional(),
})

const flaggerOutputSchema = baseFlaggerOutputSchema
  .superRefine((value, ctx) => {
    const feedback = value.feedback?.trim()

    if (value.matched) {
      if (!feedback) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feedback"],
          message: "matched=true requires positive annotation feedback",
        })
        return
      }

      if (isSelfNegatingFeedback(feedback)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feedback"],
          message: "matched=true feedback must describe the issue, not explain that no issue was detected",
        })
      }
    } else if (feedback) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feedback"],
        message: "matched=false must not include annotation feedback",
      })
    }
  })
  .transform((value) => ({
    matched: value.matched,
    ...(value.matched && value.feedback ? { feedback: value.feedback.trim() } : {}),
    ...(value.matched && value.messageIndex !== undefined ? { messageIndex: value.messageIndex } : {}),
  }))

const FLAGGER_OUTPUT_CONTRACT = `
Structured output contract:
- Set matched=false when the trace does not belong to this flagger; in that case feedback must be null or omitted.
- Set matched=true only when the trace belongs to this flagger; in that case feedback is required.
- For matched=true, feedback must be the final human-readable annotation: one or two short sentences describing the issue and concrete evidence.
- Never use matched=true with feedback that says no issue was detected, the workflow was legitimate, or the assistant behaved correctly.
- Include messageIndex only when one transcript line is clearly the best evidence.
`.trim()

const parseFlaggerOutput = (input: unknown): RunFlaggerResult => {
  const parsed = flaggerOutputSchema.safeParse(input)
  if (!parsed.success) return { matched: false }
  return parsed.data
}

const loadTraceDetail = (input: RunFlaggerInput) =>
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
export const classifyTraceForFlaggerUseCase = Effect.fn("flaggers.classifyTraceForFlagger")(function* (
  input: ClassifyTraceForFlaggerInput,
) {
  const strategy = input.strategyOverride ?? getFlaggerStrategy(input.flaggerSlug)

  if (!strategy || !isLlmCapableStrategy(strategy) || !strategy.hasRequiredContext(input.trace)) {
    return { matched: false }
  }

  const ai = yield* AI

  const decisions = yield* ai
    .generate({
      ...FLAGGER_MODEL,
      maxTokens: FLAGGER_MAX_TOKENS,
      system: `${strategy.buildSystemPrompt!(input.trace)}\n\n${FLAGGER_OUTPUT_CONTRACT}`,
      prompt: strategy.buildPrompt!(input.trace),
      schema: baseFlaggerOutputSchema,
      telemetry: {
        spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.flaggerClassify,
        tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify],
        metadata: buildProjectScopedAiMetadata(
          { organizationId: input.organizationId, projectId: input.projectId },
          { traceId: input.traceId, flaggerSlug: input.flaggerSlug },
        ),
      },
    })
    .pipe(
      Effect.map((result) => parseFlaggerOutput(result.object)),
      Effect.catchIf(
        (error): error is AIError => error instanceof AIError && isSchemaMismatchCause(error.cause),
        () =>
          Effect.gen(function* () {
            yield* Effect.annotateCurrentSpan("flagger.flaggerSchemaMismatch", true)
            return { matched: false } satisfies RunFlaggerResult
          }),
      ),
    )

  return decisions satisfies RunFlaggerResult
})

/**
 * Load the trace via the repository, then classify it.
 *
 * Production entry point for the Temporal activity. Short-circuits BEFORE
 * hitting ClickHouse if the flagger slug has no registered strategy, no LLM
 * capability, or context is missing.
 */
export const runFlaggerUseCase = Effect.fn("flaggers.runFlagger")(function* (input: RunFlaggerInput) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

  if (!hasFlaggerStrategy(input.flaggerSlug)) {
    return { matched: false }
  }

  const strategy = getFlaggerStrategy(input.flaggerSlug)
  if (!strategy || !isLlmCapableStrategy(strategy)) {
    return { matched: false }
  }

  const flaggerRepo = yield* FlaggerRepository
  const flagger = yield* flaggerRepo.findByProjectAndSlug({
    projectId: ProjectId(input.projectId),
    slug: input.flaggerSlug as FlaggerSlug,
  })
  if (!flagger || !flagger.enabled) {
    return { matched: false }
  }

  const trace = yield* loadTraceDetail(input)
  return yield* classifyTraceForFlaggerUseCase({ ...input, trace })
})
