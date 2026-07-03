import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
  type GenerateTelemetryCapture,
  resolveGenerationConfig,
} from "@domain/ai"
import {
  compileSettingsToScript,
  type EvaluationRepository,
  loadScriptSessionContext,
  previewEvaluationUseCase,
  validateEvaluationScriptCompiles,
} from "@domain/evaluations"
import type { OutboxEventWriter } from "@domain/events"
import type { ScriptRuntime, ScriptSessionContext } from "@domain/sandbox"
import {
  BadRequestError,
  type ChSqlClient,
  describeError,
  type FilterSet,
  LATITUDE_TELEMETRY_PROJECT_SLUGS,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type SqlClient,
  TraceId,
} from "@domain/shared"
import { SessionRepository, type SpanRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import {
  SIGNAL_GENERATION_DEFAULT_MODEL,
  SIGNAL_GENERATION_DISTINCT_VALUES_LIMIT,
  SIGNAL_GENERATION_MAX_GENERATE_CALLS,
} from "../constants.ts"
import { SignalGenerationError } from "../errors.ts"
import type { SignalRepository } from "../ports/signal-repository.ts"
import {
  buildSignalGenerationUserPrompt,
  SIGNAL_GENERATION_SYSTEM_PROMPT,
  type SignalGenerationGrounding,
  summarizePreviewVerdicts,
} from "../signal-generation-prompt.ts"
import {
  generatedSignalDraftSchema,
  type MappedSignalDraft,
  mapGeneratedSignalDraft,
} from "../signal-generation-schema.ts"
import { type CreateSignalError, type CreateSignalResult, createSignalUseCase } from "./create-signal.ts"

export interface CreateSignalFromPromptInput {
  readonly organizationId: string
  readonly projectId: string
  readonly prompt: string
  /** Saved-search scope hint; also scopes the grounding sample session. */
  readonly filters?: FilterSet
  /** Progress callback; the worker mirrors each step into the pending Redis result. */
  readonly onStep?: (step: string) => Effect.Effect<void>
}

export type CreateSignalFromPromptError =
  | BadRequestError
  | AIError
  | AICredentialError
  | RepositoryError
  | SignalGenerationError
  | CreateSignalError

const DAY_SECONDS = 86_400
const TRAFFIC_WINDOW_DAYS = 7
const SAMPLE_MESSAGE_MAX = 300

const formatSampleSession = (session: ScriptSessionContext): string => {
  const firstUser = session.conversation.find((message) => message.role === "user")?.content
  const lastAssistant = [...session.conversation].reverse().find((message) => message.role === "assistant")?.content
  const toolNames = [...new Set(session.traces.flatMap((trace) => trace.tools.map((tool) => tool.name)))]
  const models = [...new Set(session.traces.flatMap((trace) => trace.models))]
  return [
    `- traces: ${session.traceCount}, errors: ${session.errorCount}, duration ns: ${session.duration}, cost microcents: ${session.cost.total}`,
    `- models: ${models.join(", ") || "(none)"}`,
    `- tools invoked: ${toolNames.join(", ") || "(none)"}`,
    `- metadata keys: ${Object.keys(session.metadata).join(", ") || "(none)"}`,
    `- first user message: ${JSON.stringify(firstUser?.slice(0, SAMPLE_MESSAGE_MAX) ?? "(none)")}`,
    `- last assistant message: ${JSON.stringify(lastAssistant?.slice(0, SAMPLE_MESSAGE_MAX) ?? "(none)")}`,
  ].join("\n")
}

const DISTINCT_COLUMNS = ["tags", "serviceNames", "models", "providers", "tools", "definedTools"] as const

const assembleGrounding = (params: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly scope: FilterSet | undefined
}) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository
    const sessionRepository = yield* SessionRepository

    const [tags, serviceNames, models, providers, tools, definedTools] = yield* Effect.all(
      DISTINCT_COLUMNS.map((column) =>
        traceRepository.distinctFilterValues({
          organizationId: params.organizationId,
          projectId: params.projectId,
          column,
          limit: SIGNAL_GENERATION_DISTINCT_VALUES_LIMIT,
        }),
      ),
      { concurrency: 4 },
    )

    const histogram = yield* sessionRepository.histogramByProjectId({
      organizationId: params.organizationId,
      projectId: params.projectId,
      bucketSeconds: DAY_SECONDS,
    })
    const window = histogram.slice(-TRAFFIC_WINDOW_DAYS)
    const avgSessionsPerDay =
      window.length === 0 ? 0 : window.reduce((sum, bucket) => sum + bucket.sessionCount, 0) / window.length

    const sessions = yield* sessionRepository.listByProjectId({
      organizationId: params.organizationId,
      projectId: params.projectId,
      options: {
        limit: 1,
        sortBy: "startTime",
        sortDirection: "desc",
        ...(params.scope ? { filters: params.scope } : {}),
      },
    })
    const anchorTraceId = sessions.items[0]?.traceIds[0]

    let sampleSession: string | null = null
    if (anchorTraceId !== undefined) {
      const traceDetail = yield* traceRepository
        .findByTraceId({
          organizationId: params.organizationId,
          projectId: params.projectId,
          traceId: TraceId(anchorTraceId),
        })
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (traceDetail !== null) {
        const session = yield* loadScriptSessionContext({
          organizationId: params.organizationId,
          projectId: params.projectId,
          traceDetail,
        })
        sampleSession = formatSampleSession(session)
      }
    }

    const grounding: SignalGenerationGrounding = {
      tags,
      serviceNames,
      models,
      providers,
      tools,
      definedTools,
      avgSessionsPerDay,
      sampleSession,
    }
    return { grounding, hasSessions: anchorTraceId !== undefined }
  })

/**
 * Generates and creates a complete signal — name, description, filters, sampling, and the
 * evaluation — from a freeform description. The model is grounded in observed project data
 * (distinct filter-dimension values, tool names, traffic, one sample session) so it reconciles the
 * user's wording against real values instead of guessing. Each draft is validated (schema mapping +
 * sandbox compile) and previewed against recent sessions; failures feed a repair turn and one
 * verdict-review turn lets the model confirm or revise, bounded by
 * `SIGNAL_GENERATION_MAX_GENERATE_CALLS`. On success the signal is created immediately.
 */
export const createSignalFromPromptUseCase = (input: CreateSignalFromPromptInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const prompt = input.prompt.trim()
    if (prompt.length === 0) {
      return yield* new BadRequestError({ message: "Prompt cannot be empty" })
    }

    const onStep = input.onStep ?? (() => Effect.void)
    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)

    yield* onStep("Looking at your project's data")
    const { grounding, hasSessions } = yield* assembleGrounding({ organizationId, projectId, scope: input.filters })

    const modelConfig = yield* resolveGenerationConfig("SIGNAL_GENERATOR", SIGNAL_GENERATION_DEFAULT_MODEL)
    const telemetry: GenerateTelemetryCapture = {
      spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.signalGeneration,
      project: LATITUDE_TELEMETRY_PROJECT_SLUGS.signalGeneration,
      tags: [...AI_GENERATE_TELEMETRY_TAGS.signalGeneration],
      metadata: buildProjectScopedAiMetadata({ organizationId: input.organizationId, projectId: input.projectId }, {}),
    }
    const scopeHint =
      input.filters !== undefined && Object.keys(input.filters).length > 0 ? JSON.stringify(input.filters) : null

    const ai = yield* AI
    let feedback: string | null = null
    let review: string | null = null
    let lastValid: MappedSignalDraft | null = null
    let reviewed = false

    for (let call = 1; call <= SIGNAL_GENERATION_MAX_GENERATE_CALLS; call++) {
      yield* onStep(
        call === 1 ? "Drafting your signal" : review !== null ? "Reviewing the test results" : "Revising the draft",
      )
      const generated = yield* ai.generate({
        ...modelConfig,
        system: SIGNAL_GENERATION_SYSTEM_PROMPT,
        prompt: buildSignalGenerationUserPrompt({ prompt, grounding, scopeHint, feedback, review }),
        schema: generatedSignalDraftSchema,
        telemetry,
      })

      // `confirm` is only honored on a review turn, over the draft that was actually previewed.
      if (review !== null && generated.object.confirm && lastValid !== null) break
      review = null
      feedback = null

      const mapped = mapGeneratedSignalDraft(generated.object)
      if (!mapped.ok) {
        feedback = mapped.issues
        continue
      }

      const script =
        "settings" in mapped.draft.evaluation
          ? compileSettingsToScript(mapped.draft.evaluation.settings)
          : mapped.draft.evaluation.script
      const compileError = yield* validateEvaluationScriptCompiles(script).pipe(
        Effect.match({ onSuccess: () => null, onFailure: (error) => describeError(error) }),
      )
      if (compileError !== null) {
        feedback = `The evaluation script does not compile: ${compileError}`
        continue
      }

      if (!hasSessions) {
        lastValid = mapped.draft
        break
      }

      yield* onStep("Testing it against recent sessions")
      const preview = yield* previewEvaluationUseCase({
        organizationId: input.organizationId,
        projectId: input.projectId,
        filters: mapped.draft.filters ?? null,
        evaluation: mapped.draft.evaluation,
      }).pipe(
        Effect.map((result) => ({ ok: true as const, items: result.items })),
        Effect.catchTag("ScriptCompileError", (error) =>
          Effect.succeed({ ok: false as const, error: describeError(error) }),
        ),
      )
      if (!preview.ok) {
        feedback = `The evaluation script does not compile: ${preview.error}`
        continue
      }

      const rows = preview.items
      if (rows.length > 0 && rows.every((row) => row.error !== null)) {
        feedback = `Every preview run errored. First error: ${rows[0]?.error ?? "unknown"}`
        continue
      }

      lastValid = mapped.draft
      if (reviewed) break
      reviewed = true
      review = summarizePreviewVerdicts(rows)
    }

    if (lastValid === null) {
      return yield* new SignalGenerationError({ attempts: SIGNAL_GENERATION_MAX_GENERATE_CALLS, message: feedback })
    }

    yield* onStep("Creating the signal")
    return yield* createSignalUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      name: lastValid.name,
      description: lastValid.description,
      ...(lastValid.filters !== undefined ? { filters: lastValid.filters } : {}),
      sampling: lastValid.sampling,
      evaluation: lastValid.evaluation,
    })
  }).pipe(Effect.withSpan("signals.createSignalFromPrompt")) as Effect.Effect<
    CreateSignalResult,
    CreateSignalFromPromptError,
    | AI
    | ScriptRuntime
    | TraceRepository
    | SessionRepository
    | SpanRepository
    | ChSqlClient
    | SignalRepository
    | EvaluationRepository
    | OutboxEventWriter
    | SqlClient
  >
