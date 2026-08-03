import type { AI } from "@domain/ai"
import {
  type AgentToolDef,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  AIAgent,
  buildProjectScopedAiMetadata,
  type GenerateTelemetryCapture,
  type RunAgentInput,
  resolveGenerationConfig,
} from "@domain/ai"
import {
  compileSettingsToScript,
  type EvaluationRepository,
  previewEvaluationUseCase,
  validateEvaluationScriptCompiles,
} from "@domain/evaluations"
import type { OutboxEventWriter } from "@domain/events"
import { OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer } from "@domain/queue"
import type { ScriptRuntime } from "@domain/sandbox"
import {
  type ChSqlClient,
  describeError,
  type FilterSet,
  filterSetSchema,
  LATITUDE_TELEMETRY_PROJECT_SLUGS,
  OrganizationId,
  type SqlClient,
  UserId,
} from "@domain/shared"
import {
  assembleSignalGenerationGrounding,
  buildSignalGenerationResultKey,
  buildSignalGenerationUserPrompt,
  createSignalUseCase,
  type GeneratedSignalDraft,
  generatedSignalDraftSchema,
  mapGeneratedSignalDraft,
  SIGNAL_GENERATION_DEADLINE_MS,
  SIGNAL_GENERATION_DEFAULT_MODEL,
  SIGNAL_GENERATION_MAX_STEPS,
  SIGNAL_GENERATION_RESULT_TTL_SECONDS,
  SIGNAL_GENERATION_SYSTEM_PROMPT,
  type SignalGenerationResult,
  type SignalRepository,
  summarizePreviewVerdicts,
} from "@domain/signals"
import type {
  MessageEmbeddingRepository,
  SessionRepository,
  SpanRepository,
  TraceRepository,
  TraceSearchRepository,
} from "@domain/spans"
import { AIAgentLive, AIEmbedLive, AIGenerateLive, withAi } from "@platform/ai"
import type { RedisClient } from "@platform/cache-redis"
import {
  type ClickHouseClient,
  MessageEmbeddingRepositoryLive,
  SessionRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  TraceSearchRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import {
  EvaluationRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  type PostgresClient,
  ProjectRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { QuickJsScriptRuntimeLive } from "@platform/sandbox-quickjs"
import { createLogger, withTracing } from "@repo/observability"
import { type OperationContext, signalAgentToolset } from "@repo/operations"
import { Effect, Layer } from "effect"
import { z } from "zod"

import {
  getClickhouseClient,
  getPostgresClient,
  getQueuePublisher,
  getRedisClient,
  getStorageDisk,
  getWorkflowQuerier,
  getWorkflowStarter,
} from "../clients.ts"
import { createSignalGenerationProgressWriter } from "./signal-generation-progress.ts"

const logger = createLogger("signals-generate-signal")
const SIGNALS_GENERATE_SIGNAL_QUEUE = "signals-generate-signal" as const
const SIGNALS_GENERATE_SIGNAL_RUN_TASK = "run" as const

// Cap each research tool result so a trace/span payload cannot blow the agent's
// context window or cost — the agent should lean on the aggregate operations.
const TOOL_RESULT_MAX_CHARS = 12_000

// Every service the bespoke tools' use-cases require; `provideDomain` supplies them all.
type DomainServices =
  | SqlClient
  | ChSqlClient
  | AI
  | ScriptRuntime
  | SignalRepository
  | EvaluationRepository
  | OutboxEventWriter
  | ProjectRepository
  | SessionRepository
  | SpanRepository
  | TraceRepository
  | MessageEmbeddingRepository
  | TraceSearchRepository

interface SignalsGenerateSignalPayload {
  readonly generationId: string
  readonly organizationId: string
  readonly projectId: string
  readonly prompt: string
  readonly filters?: unknown
}

type SignalsGenerateSignalLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface SignalsGenerateSignalDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  postgresClient?: PostgresClient
  redisClient?: RedisClient
  logger?: SignalsGenerateSignalLogger
}

const writeResult = (redisClient: RedisClient, payload: SignalsGenerateSignalPayload, result: SignalGenerationResult) =>
  Effect.tryPromise(() =>
    redisClient.set(
      buildSignalGenerationResultKey(payload.organizationId, payload.generationId),
      JSON.stringify(result),
      "EX",
      SIGNAL_GENERATION_RESULT_TTL_SECONDS,
    ),
  )

// The generation creates a signal at the end, so a stall-recovery redelivery of the same job must
// not run it twice; the first delivery takes the claim, any later one exits without side effects.
// The claim outlives the result TTL by a wide margin so a slow run (research plus judge previews)
// cannot see its claim expire while still executing.
const CLAIM_TTL_SECONDS = 1800

const claimJob = (redisClient: RedisClient, payload: SignalsGenerateSignalPayload) =>
  Effect.tryPromise(() =>
    redisClient.set(
      `${buildSignalGenerationResultKey(payload.organizationId, payload.generationId)}:claim`,
      "1",
      "EX",
      CLAIM_TTL_SECONDS,
      "NX",
    ),
  ).pipe(Effect.map((result) => result === "OK"))

const formatZodIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")

const extractToolBody = (output: unknown): unknown =>
  output !== null && typeof output === "object" && "body" in output ? (output as { body: unknown }).body : output

const truncateToolResult = (value: unknown): unknown => {
  const serialized = JSON.stringify(value)
  if (serialized === undefined || serialized.length <= TOOL_RESULT_MAX_CHARS) {
    return value
  }
  return { truncated: true, preview: serialized.slice(0, TOOL_RESULT_MAX_CHARS) }
}

// Runs the whole generation: build an in-process operation context, warm-start the agent with
// grounding, then let it research the project and create a signal via bespoke tools. Always
// resolves to a terminal `SignalGenerationResult`; the caller mirrors it into Redis.
const runAgenticGeneration = async (params: {
  readonly deps: {
    readonly clickhouseClient: ClickHouseClient
    readonly postgresClient: PostgresClient
    readonly redisClient: RedisClient
  }
  readonly payload: SignalsGenerateSignalPayload
  readonly filters: FilterSet | undefined
}): Promise<SignalGenerationResult> => {
  const { deps, payload, filters } = params
  const organizationId = payload.organizationId
  const projectId = payload.projectId
  const orgId = OrganizationId(organizationId)

  const prompt = payload.prompt.trim()
  if (prompt.length === 0) {
    return { status: "error", error: "Prompt cannot be empty." }
  }

  const resultKey = buildSignalGenerationResultKey(organizationId, payload.generationId)
  const progress = createSignalGenerationProgressWriter({
    setResult: async (value) =>
      deps.redisClient.set(resultKey, JSON.stringify(value), "EX", SIGNAL_GENERATION_RESULT_TTL_SECONDS),
  })

  try {
    // Every use-case below owns its full layer pipe, exactly as the HTTP handlers do.
    const provideDomain = <A, E>(effect: Effect.Effect<A, E, DomainServices>): Effect.Effect<A, E> =>
      effect.pipe(
        withPostgres(
          Layer.mergeAll(EvaluationRepositoryLive, OutboxEventWriterLive, ProjectRepositoryLive, SignalRepositoryLive),
          deps.postgresClient,
          orgId,
        ),
        withClickHouse(
          Layer.mergeAll(
            SessionRepositoryLive,
            SpanRepositoryLive,
            TraceRepositoryLive,
            MessageEmbeddingRepositoryLive,
            TraceSearchRepositoryLive,
          ),
          deps.clickhouseClient,
          orgId,
        ),
        Effect.provide(QuickJsScriptRuntimeLive),
        withAi(Layer.mergeAll(AIGenerateLive, AIEmbedLive), deps.redisClient),
        withTracing,
      )

    const [organization, project, queuePublisher, workflowStarter, workflowQuerier] = await Promise.all([
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* OrganizationRepository
          return yield* repo.findById(orgId)
        }).pipe(withPostgres(OrganizationRepositoryLive, deps.postgresClient, orgId), withTracing),
      ),
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ProjectRepository
          return yield* repo.findById(projectId)
        }).pipe(withPostgres(ProjectRepositoryLive, deps.postgresClient, orgId), withTracing),
      ),
      getQueuePublisher(),
      getWorkflowStarter(),
      getWorkflowQuerier(),
    ])
    const projectSlug = project.slug

    const ctx: OperationContext = {
      organization,
      auth: { method: "api-key", userId: UserId("system:signal-agent"), organizationId: orgId },
      postgresClient: deps.postgresClient,
      clickhouse: deps.clickhouseClient,
      redis: deps.redisClient,
      queuePublisher,
      workflowStarter,
      workflowQuerier,
      storageDisk: getStorageDisk(),
    }

    progress.writeStep("Looking at your project's data")
    const { grounding } = await Effect.runPromise(
      provideDomain(assembleSignalGenerationGrounding({ organizationId, projectId, scope: filters })),
    )

    // Research tools: the curated read-only toolset with the project pinned. The
    // model-facing schema drops `projectSlug` (merged in on execute) so the agent
    // can't probe other projects and never has to supply it.
    const researchTools: AgentToolDef[] = signalAgentToolset.tools.map((toolDef) => {
      const inputSchema =
        toolDef.inputSchema instanceof z.ZodObject && "projectSlug" in toolDef.inputSchema.shape
          ? toolDef.inputSchema.omit({ projectSlug: true })
          : toolDef.inputSchema
      return {
        name: toolDef.name,
        description: toolDef.description,
        inputSchema,
        execute: (rawInput) =>
          Effect.runPromise(
            toolDef.invoke({ ...(rawInput as Record<string, unknown>), projectSlug }, ctx).pipe(
              Effect.match({
                onSuccess: (output) => truncateToolResult(extractToolBody(output)),
                onFailure: (error) => ({ error: describeError(error) }),
              }),
            ),
          ),
      }
    })

    const previewSignalToolSchema = generatedSignalDraftSchema.extend({
      traceIds: z
        .array(z.string().min(1))
        .describe(
          "Trace IDs (from research tools, e.g. listToolCalls) of specific sessions to test against — pick traces where the behavior definitely does or definitely does not occur to verify the draft fires correctly. Empty array [] tests the most recent sessions instead.",
        ),
    })

    const previewSignalTool: AgentToolDef = {
      name: "previewSignal",
      description:
        "Run a candidate signal draft against sessions and return a summary of per-session verdicts, without creating anything. Pass traceIds to check known positive/negative examples, or [] for the latest sessions. Use it to confirm the draft behaves as expected before createSignal.",
      inputSchema: previewSignalToolSchema,
      execute: async (rawInput) => {
        const parsed = previewSignalToolSchema.safeParse(rawInput)
        if (!parsed.success) {
          return { error: formatZodIssues(parsed.error) }
        }
        const mapped = mapGeneratedSignalDraft(parsed.data)
        if (!mapped.ok) {
          return { error: mapped.issues }
        }
        return Effect.runPromise(
          provideDomain(
            previewEvaluationUseCase({
              organizationId,
              projectId,
              filters: mapped.draft.filters ?? null,
              evaluation: mapped.draft.evaluation,
              ...(parsed.data.traceIds.length > 0 ? { traceIds: parsed.data.traceIds } : {}),
            }).pipe(
              Effect.match({
                onSuccess: (result) => ({ summary: summarizePreviewVerdicts(result.items) }),
                onFailure: (error) => ({ error: describeError(error) }),
              }),
            ),
          ),
        )
      },
    }

    // Holders (not bare `let`s) so assignments inside tool closures survive TypeScript's control-flow
    // narrowing at the terminal read after `runAgent` resolves.
    const captureBox: { signal: { readonly signalId: string; readonly slug: string } | null } = { signal: null }
    const unsatisfiableBox: { reason: string | null } = { reason: null }

    const createSignalDraft = (draft: GeneratedSignalDraft) =>
      Effect.gen(function* () {
        const mapped = mapGeneratedSignalDraft(draft)
        if (!mapped.ok) {
          return { error: mapped.issues }
        }
        const script =
          "settings" in mapped.draft.evaluation
            ? compileSettingsToScript(mapped.draft.evaluation.settings)
            : mapped.draft.evaluation.script
        const compileError = yield* validateEvaluationScriptCompiles(script).pipe(
          Effect.match({ onSuccess: () => null, onFailure: (error) => describeError(error) }),
        )
        if (compileError !== null) {
          return { error: `The evaluation script does not compile: ${compileError}` }
        }
        const preview = yield* previewEvaluationUseCase({
          organizationId,
          projectId,
          filters: mapped.draft.filters ?? null,
          evaluation: mapped.draft.evaluation,
        }).pipe(
          // A draft that compiles but throws (bad script, judge/embedding failure) still resolves
          // here with every row carrying an `error` — creating the signal anyway would persist one
          // that errors on every session. Reject it so the agent fixes and retries.
          Effect.map((result) => {
            const rows = result.items
            return rows.length > 0 && rows.every((row) => row.error !== null)
              ? {
                  ok: false as const,
                  error: `Every previewed session errored. First error: ${rows[0]?.error ?? "unknown"}`,
                }
              : { ok: true as const }
          }),
          Effect.catchTag("ScriptCompileError", (error) =>
            Effect.succeed({
              ok: false as const,
              error: `The evaluation script does not compile: ${describeError(error)}`,
            }),
          ),
        )
        if (!preview.ok) {
          return { error: preview.error }
        }
        const created = yield* createSignalUseCase({
          organizationId,
          projectId,
          name: mapped.draft.name,
          description: mapped.draft.description,
          ...(mapped.draft.filters !== undefined ? { filters: mapped.draft.filters } : {}),
          sampling: mapped.draft.sampling,
          evaluation: mapped.draft.evaluation,
        })
        captureBox.signal = { signalId: created.signalId, slug: created.slug }
        return { signalId: created.signalId, slug: created.slug }
      })

    const createSignalTool: AgentToolDef = {
      name: "createSignal",
      description:
        "Terminal tool: validate, preview, and create the signal from the draft. Call it exactly once when confident. Returns {signalId, slug} on success or {error} to fix and retry.",
      inputSchema: generatedSignalDraftSchema,
      execute: async (rawInput) => {
        // The SDK loop keeps running after a successful tool result, so a second createSignal call
        // in the same run must not create a second signal — return the one already created.
        if (captureBox.signal !== null) {
          return { signalId: captureBox.signal.signalId, slug: captureBox.signal.slug }
        }
        const parsed = generatedSignalDraftSchema.safeParse(rawInput)
        if (!parsed.success) {
          return { error: formatZodIssues(parsed.error) }
        }
        return Effect.runPromise(
          provideDomain(
            createSignalDraft(parsed.data).pipe(
              Effect.match({
                onSuccess: (result) => result,
                onFailure: (error) => ({ error: describeError(error) }),
              }),
            ),
          ),
        )
      },
    }

    const reportUnsatisfiableSchema = z.object({
      reason: z
        .string()
        .min(1)
        .describe("One or two plain sentences, shown directly to the user, explaining why no signal was created."),
    })

    const reportUnsatisfiableTool: AgentToolDef = {
      name: "reportUnsatisfiable",
      description:
        "Terminal tool: call this instead of createSignal when the request cannot become a signal. Use it when the request is not a description of a signal to track, or when the behavior cannot be detected because the user gave no method to detect it and nothing in the data carries it — do not fabricate a detector (guessing at field names or regexes for information you were not told how to find and did not observe). Do not use it for a draft that merely failed validation — fix and retry createSignal for those.",
      inputSchema: reportUnsatisfiableSchema,
      execute: async (rawInput) => {
        const parsed = reportUnsatisfiableSchema.safeParse(rawInput)
        if (!parsed.success) {
          return { error: formatZodIssues(parsed.error) }
        }
        unsatisfiableBox.reason = parsed.data.reason
        return { acknowledged: true }
      },
    }

    const modelConfig = await Effect.runPromise(
      resolveGenerationConfig("SIGNAL_GENERATOR", SIGNAL_GENERATION_DEFAULT_MODEL),
    )
    const telemetry: GenerateTelemetryCapture = {
      spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.signalGeneration,
      project: LATITUDE_TELEMETRY_PROJECT_SLUGS.signalGeneration,
      tags: [...AI_GENERATE_TELEMETRY_TAGS.signalGeneration],
      metadata: buildProjectScopedAiMetadata({ organizationId, projectId }, {}),
    }
    const scopeHint = filters !== undefined && Object.keys(filters).length > 0 ? JSON.stringify(filters) : null

    const runInput: RunAgentInput = {
      provider: modelConfig.provider,
      model: modelConfig.model,
      system: SIGNAL_GENERATION_SYSTEM_PROMPT,
      prompt: buildSignalGenerationUserPrompt({ prompt, grounding, scopeHint }),
      tools: [...researchTools, previewSignalTool, createSignalTool, reportUnsatisfiableTool],
      maxSteps: SIGNAL_GENERATION_MAX_STEPS,
      ...(modelConfig.reasoning !== undefined ? { reasoning: modelConfig.reasoning } : {}),
      ...(modelConfig.maxTokens !== undefined ? { maxTokens: modelConfig.maxTokens } : {}),
      ...(modelConfig.temperature !== undefined ? { temperature: modelConfig.temperature } : {}),
      onStep: (step) => {
        if (step.text !== undefined) {
          progress.writeStep(step.text)
        }
      },
      telemetry,
    }

    // Wall-clock guard so an overrun surfaces as a terminal error before the browser poll times out.
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(), SIGNAL_GENERATION_DEADLINE_MS)
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const agent = yield* AIAgent
          return yield* agent.runAgent({ ...runInput, abortSignal: controller.signal })
        }).pipe(Effect.provide(AIAgentLive), withTracing),
      )
    } catch (error) {
      if (captureBox.signal !== null) {
        return {
          status: "done",
          signalId: captureBox.signal.signalId,
          slug: captureBox.signal.slug,
        }
      }
      if (unsatisfiableBox.reason !== null) {
        return { status: "error", error: unsatisfiableBox.reason }
      }
      return { status: "error", error: describeError(error) }
    } finally {
      clearTimeout(deadline)
    }

    if (captureBox.signal !== null) {
      return {
        status: "done",
        signalId: captureBox.signal.signalId,
        slug: captureBox.signal.slug,
      }
    }
    if (unsatisfiableBox.reason !== null) {
      return { status: "error", error: unsatisfiableBox.reason }
    }
    return { status: "error", error: "The agent finished without creating a signal." }
  } finally {
    await progress.finalize()
  }
}

const runGenerateSignalJob =
  (deps: {
    readonly clickhouseClient: ClickHouseClient
    readonly postgresClient: PostgresClient
    readonly redisClient: RedisClient
  }) =>
  (payload: SignalsGenerateSignalPayload) => {
    let filters: FilterSet | undefined
    if (payload.filters != null) {
      const parsed = filterSetSchema.safeParse(payload.filters)
      if (!parsed.success) {
        return writeResult(deps.redisClient, payload, {
          status: "error",
          error: "Invalid filters in the generation request.",
        }).pipe(Effect.asVoid)
      }
      filters = parsed.data
    }

    return claimJob(deps.redisClient, payload).pipe(
      Effect.flatMap((claimed) => {
        if (!claimed) return Effect.void
        return Effect.tryPromise({
          try: () => runAgenticGeneration({ deps, payload, filters }),
          catch: (error) => error,
        }).pipe(
          Effect.matchEffect({
            onSuccess: (result) => writeResult(deps.redisClient, payload, result),
            onFailure: (error) =>
              writeResult(deps.redisClient, payload, { status: "error", error: describeError(error) }),
          }),
        )
      }),
      Effect.asVoid,
    )
  }

export const createSignalsGenerateSignalWorker = ({
  consumer,
  clickhouseClient,
  postgresClient,
  redisClient,
  logger: injectedLogger,
}: SignalsGenerateSignalDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const pgClient = postgresClient ?? getPostgresClient()
  const rdClient = redisClient ?? getRedisClient()
  const genLogger = injectedLogger ?? logger
  const run = runGenerateSignalJob({ clickhouseClient: chClient, postgresClient: pgClient, redisClient: rdClient })

  consumer.subscribe(SIGNALS_GENERATE_SIGNAL_QUEUE, {
    run: (payload) =>
      run(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            genLogger.error("Signal generation failed", {
              queue: SIGNALS_GENERATE_SIGNAL_QUEUE,
              task: SIGNALS_GENERATE_SIGNAL_RUN_TASK,
              organizationId: payload.organizationId,
              projectId: payload.projectId,
              generationId: payload.generationId,
              error,
            }),
          ),
        ),
      ),
  })
}
