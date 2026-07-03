import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
  type GenerateTelemetryCapture,
  type GenerationModelConfig,
  resolveGenerationConfig,
} from "@domain/ai"
import type { HostSimilarityFunction, ScriptRuntime, ScriptSessionContext } from "@domain/sandbox"
import {
  BadRequestError,
  type ChSqlClient,
  type FilterSet,
  LATITUDE_TELEMETRY_PROJECT_SLUGS,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  TraceId,
} from "@domain/shared"
import {
  type MessageEmbeddingRepository,
  SessionRepository,
  type SpanRepository,
  TraceRepository,
  type TraceSearchRepository,
} from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { EVALUATION_SCRIPT_GENERATION_DEFAULT_MODEL, EVALUATION_SCRIPT_GENERATION_MAX_ATTEMPTS } from "../constants.ts"
import { type EvaluationExecutionError, EvaluationScriptGenerationError } from "../errors.ts"
import { EVALUATION_SCRIPT_GENERATION_SYSTEM_PROMPT } from "../runtime/evaluation-execution.ts"
import { loadScriptSessionContext } from "../runtime/load-session-context.ts"
import { executeEvaluationScriptSandboxed } from "../runtime/sandbox-execution.ts"
import { buildSemanticSimilarityHost } from "../runtime/semantic-similarity.ts"

export interface CreateScriptFromPromptInput {
  readonly organizationId: string
  readonly projectId: string
  readonly prompt: string
  /** Signal scope; the smoke-test session is picked from within it so validation matches what the signal will run against. */
  readonly filters?: FilterSet
}

export interface CreateScriptFromPromptResult {
  readonly script: string
  readonly reasoning: string
}

export type CreateScriptFromPromptError =
  | BadRequestError
  | AIError
  | AICredentialError
  | RepositoryError
  | EvaluationScriptGenerationError

const scriptGenerationSchema = z.object({
  reasoning: z.string().min(1).describe("Brief rationale for how the script detects the requested behavior"),
  script: z.string().min(1).describe("Complete sandbox evaluation script body, raw JavaScript with no markdown fences"),
})

interface GeneratedCandidate {
  readonly script: string
  readonly reasoning: string
}

type AttemptFailure = EvaluationExecutionError | AIError | AICredentialError
type AttemptOutcome = { readonly ok: true } | { readonly ok: false; readonly error: AttemptFailure }

const buildGenerationPrompt = (
  userPrompt: string,
  previous: { readonly script: string; readonly error: string } | null,
): string => {
  const parts = ["Write an evaluation script for the following request:", userPrompt]

  if (previous) {
    parts.push(
      "Your previous script failed when run in the sandbox against a real session. Fix it.",
      "Previous script:",
      previous.script,
      "Sandbox error:",
      previous.error,
    )
  }

  parts.push("Return reasoning and the script per the schema.")
  return parts.join("\n\n")
}

const generateCandidate = (params: {
  readonly modelConfig: GenerationModelConfig
  readonly userPrompt: string
  readonly previous: { readonly script: string; readonly error: string } | null
  readonly telemetry: GenerateTelemetryCapture
}): Effect.Effect<GeneratedCandidate, AIError | AICredentialError, AI> =>
  Effect.gen(function* () {
    const ai = yield* AI
    const result = yield* ai.generate({
      ...params.modelConfig,
      system: EVALUATION_SCRIPT_GENERATION_SYSTEM_PROMPT,
      prompt: buildGenerationPrompt(params.userPrompt, params.previous),
      schema: scriptGenerationSchema,
      telemetry: params.telemetry,
    })
    return result.object
  })

const runCandidate = (params: {
  readonly script: string
  readonly session: ScriptSessionContext
  readonly similarity: HostSimilarityFunction
}): Effect.Effect<AttemptOutcome, never, AI | ScriptRuntime> =>
  executeEvaluationScriptSandboxed(params).pipe(
    Effect.match({
      onSuccess: (): AttemptOutcome => ({ ok: true }),
      onFailure: (error): AttemptOutcome => ({ ok: false, error }),
    }),
  )

/**
 * Generates an arbitrary sandbox evaluation script from a freeform user prompt. The model is taught the
 * frozen `session` schema it will receive (`EVALUATION_SCRIPT_GENERATION_SYSTEM_PROMPT`); each candidate
 * is smoke-tested by running it in the sandbox against one representative project session. On failure the
 * sandbox error is fed back and the script is regenerated, up to `EVALUATION_SCRIPT_GENERATION_MAX_ATTEMPTS`
 * times; if none runs, it aborts with `EvaluationScriptGenerationError`. Persisting the script is the caller's job.
 */
export const createScriptFromPromptUseCase = (input: CreateScriptFromPromptInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const prompt = input.prompt.trim()
    if (prompt.length === 0) {
      return yield* new BadRequestError({ message: "Prompt cannot be empty" })
    }

    const traceRepository = yield* TraceRepository
    const sessionRepository = yield* SessionRepository
    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)

    const noSession = () =>
      new BadRequestError({ message: "No sessions in the selected scope to validate the generated script against" })

    const sessions = yield* sessionRepository.listByProjectId({
      organizationId,
      projectId,
      options: {
        limit: 1,
        sortBy: "startTime",
        sortDirection: "desc",
        ...(input.filters ? { filters: input.filters } : {}),
      },
    })
    const anchorTraceId = sessions.items[0]?.traceIds[0]
    if (anchorTraceId === undefined) {
      return yield* noSession()
    }

    const traceDetail = yield* traceRepository
      .findByTraceId({ organizationId, projectId, traceId: TraceId(anchorTraceId) })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.fail(noSession())))

    const session = yield* loadScriptSessionContext({ organizationId, projectId, traceDetail })

    // A generated script may call semanticSimilarity(); the smoke test needs the host or the run would
    // trip the runtime's embedding-host guard. Built against the smoke-test session, like live/preview.
    const similarity = yield* buildSemanticSimilarityHost({
      organizationId,
      projectId,
      traceIds: session.traces.map((trace) => trace.id),
    })

    const modelConfig = yield* resolveGenerationConfig(
      "EVALUATION_SCRIPT_GENERATOR",
      EVALUATION_SCRIPT_GENERATION_DEFAULT_MODEL,
    )

    const telemetry: GenerateTelemetryCapture = {
      spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.evaluationScriptGeneration,
      project: LATITUDE_TELEMETRY_PROJECT_SLUGS.evaluationScriptGeneration,
      tags: [...AI_GENERATE_TELEMETRY_TAGS.evaluationScriptGeneration],
      metadata: buildProjectScopedAiMetadata({ organizationId: input.organizationId, projectId: input.projectId }, {}),
    }

    let previous: { readonly script: string; readonly error: string } | null = null

    for (let attempt = 1; attempt <= EVALUATION_SCRIPT_GENERATION_MAX_ATTEMPTS; attempt++) {
      const candidate: GeneratedCandidate = yield* generateCandidate({
        modelConfig,
        userPrompt: prompt,
        previous,
        telemetry,
      })
      const outcome: AttemptOutcome = yield* runCandidate({ script: candidate.script, session, similarity })

      if (outcome.ok) {
        return { script: candidate.script, reasoning: candidate.reasoning } satisfies CreateScriptFromPromptResult
      }

      if (outcome.error._tag === "AICredentialError") {
        return yield* outcome.error
      }

      previous = { script: candidate.script, error: outcome.error.message }
    }

    return yield* new EvaluationScriptGenerationError({
      attempts: EVALUATION_SCRIPT_GENERATION_MAX_ATTEMPTS,
      message: previous?.error ?? null,
    })
  }).pipe(Effect.withSpan("evaluations.createScriptFromPrompt")) as Effect.Effect<
    CreateScriptFromPromptResult,
    CreateScriptFromPromptError,
    | AI
    | ScriptRuntime
    | TraceRepository
    | SessionRepository
    | SpanRepository
    | ChSqlClient
    | MessageEmbeddingRepository
    | TraceSearchRepository
  >
