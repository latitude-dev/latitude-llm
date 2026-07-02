import type { AI } from "@domain/ai"
import type { ScriptCompileError, ScriptRuntime, ScriptSessionContext } from "@domain/sandbox"
import {
  cuidSchema,
  evaluationSettingsSchema,
  type FilterSet,
  filterSetSchema,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  TraceId,
} from "@domain/shared"
import { SessionRepository, type SpanRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { compileSettingsToScript, validateEvaluationScriptCompiles } from "../codegen/compile-settings-to-script.ts"
import { loadScriptSessionContext } from "../runtime/load-session-context.ts"
import { executeEvaluationScriptSandboxed } from "../runtime/sandbox-execution.ts"

const PREVIEW_SAMPLE_LIMIT = 10
const PREVIEW_CONCURRENCY = 5

const previewEvaluationInputSchema = z.object({
  organizationId: cuidSchema.transform(OrganizationId),
  projectId: cuidSchema.transform(ProjectId),
  filters: filterSetSchema.nullish(),
  // Exactly one of a declarative `settings` form or a raw `script`, mirroring createSignal.
  evaluation: z.union([
    z.object({ settings: evaluationSettingsSchema }).strict(),
    z.object({ script: z.string().min(1) }).strict(),
  ]),
})

export type PreviewEvaluationInput = z.input<typeof previewEvaluationInputSchema>

/** A session's identity + key metrics, so a preview row is recognizable and explains metric matches. */
export interface PreviewSessionSummary {
  /** First user message in the session, truncated — the human "what was this about". */
  readonly firstUserMessage: string | null
  readonly durationNs: number
  readonly costMicrocents: number
  readonly tokensTotal: number
  readonly traceCount: number
  readonly errorCount: number
}

export interface PreviewEvaluationRow {
  readonly sessionId: string
  readonly traceId: string
  /** Host-derived verdict (value ≥ threshold); `null` when the run errored. */
  readonly passed: boolean | null
  /** Normalized score ∈ [0,1]; `null` when the run errored. */
  readonly value: number | null
  readonly feedback: string
  /** Set when this sample's run errored; the rest of the preview still returns. */
  readonly error: string | null
  /** Session content + metrics; `null` only when the session itself couldn't be loaded. */
  readonly summary: PreviewSessionSummary | null
}

export interface PreviewEvaluationResult {
  readonly items: readonly PreviewEvaluationRow[]
}

export type PreviewEvaluationError = ScriptCompileError | RepositoryError

const describeError = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error)

const SUMMARY_MESSAGE_MAX = 280

const buildSummary = (session: ScriptSessionContext): PreviewSessionSummary => {
  const firstUser = session.conversation.find((message) => message.role === "user")?.content ?? null
  return {
    firstUserMessage: firstUser ? firstUser.slice(0, SUMMARY_MESSAGE_MAX) : null,
    durationNs: session.duration,
    costMicrocents: session.cost.total,
    tokensTotal: session.tokens.total,
    traceCount: session.traceCount,
    errorCount: session.errorCount,
  }
}

/**
 * Compiles an evaluation (declarative `settings` or a raw `script`) and runs it against the latest
 * matching sessions, returning per-sample verdicts **without persisting any score**. Powers the
 * builder's on-demand live preview. A definition-level compile error fails the whole request (422);
 * a per-sample runtime error (including a judge `llm()` failure) is captured on that row so the rest
 * of the preview still returns.
 */
export const previewEvaluationUseCase = (input: PreviewEvaluationInput) =>
  Effect.gen(function* () {
    const parsed = previewEvaluationInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("projectId", String(parsed.projectId))

    const script =
      "settings" in parsed.evaluation ? compileSettingsToScript(parsed.evaluation.settings) : parsed.evaluation.script
    yield* validateEvaluationScriptCompiles(script)

    const filters: FilterSet | undefined = parsed.filters ?? undefined
    const sessionRepository = yield* SessionRepository
    const traceRepository = yield* TraceRepository
    const page = yield* sessionRepository.listByProjectId({
      organizationId: parsed.organizationId,
      projectId: parsed.projectId,
      options: { limit: PREVIEW_SAMPLE_LIMIT, ...(filters ? { filters } : {}) },
    })

    const rows = yield* Effect.forEach(
      page.items,
      (session) => {
        // Any trace anchors the load: `loadScriptSessionContext` resolves the sessionId from it and
        // evaluates the whole session (all traces), so the choice of `[0]` doesn't narrow coverage.
        const traceId = session.traceIds[0]
        if (traceId === undefined) {
          return Effect.succeed(null)
        }
        return Effect.gen(function* () {
          const traceDetail = yield* traceRepository
            .findByTraceId({
              organizationId: parsed.organizationId,
              projectId: parsed.projectId,
              traceId: TraceId(traceId),
            })
            .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
          if (traceDetail === null) {
            return null
          }

          const scriptSession = yield* loadScriptSessionContext({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            traceDetail,
          })
          const execution = yield* executeEvaluationScriptSandboxed({ script, session: scriptSession })
          return {
            sessionId: session.sessionId,
            traceId,
            passed: execution.result.passed,
            value: execution.result.value,
            feedback: execution.result.feedback,
            error: null,
            summary: buildSummary(scriptSession),
          } satisfies PreviewEvaluationRow
        }).pipe(
          Effect.match({
            onSuccess: (row): PreviewEvaluationRow | null => row,
            onFailure: (error): PreviewEvaluationRow => ({
              sessionId: session.sessionId,
              traceId,
              passed: null,
              value: null,
              feedback: "",
              error: describeError(error),
              summary: null,
            }),
          }),
        )
      },
      { concurrency: PREVIEW_CONCURRENCY },
    )

    return { items: rows.filter((row): row is PreviewEvaluationRow => row !== null) } satisfies PreviewEvaluationResult
  }).pipe(Effect.withSpan("evaluations.previewEvaluation")) as Effect.Effect<
    PreviewEvaluationResult,
    PreviewEvaluationError,
    AI | ScriptRuntime | SessionRepository | SpanRepository | TraceRepository
  >
