import { loadScriptSessionContext } from "@domain/evaluations"
import type { ScriptSessionContext } from "@domain/sandbox"
import {
  type ChSqlClient,
  type FilterSet,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  TraceId,
} from "@domain/shared"
import { SessionRepository, type SpanRepository, type TraceDistinctColumn, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { SIGNAL_GENERATION_DISTINCT_VALUES_LIMIT } from "./constants.ts"
import type { SignalGenerationGrounding } from "./signal-generation-prompt.ts"

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

export interface SignalGenerationGroundingResult {
  readonly grounding: SignalGenerationGrounding
  readonly hasSessions: boolean
}

/**
 * Warm-start context for the agentic generator: distinct filter-dimension
 * values, tool names, recent traffic, and one sample session. The agent uses
 * its research toolset for anything deeper, but this seed lets it reconcile the
 * user's wording against real project values without a first tool round-trip.
 */
export const assembleSignalGenerationGrounding = (params: {
  readonly organizationId: string
  readonly projectId: string
  readonly scope?: FilterSet | undefined
}): Effect.Effect<
  SignalGenerationGroundingResult,
  RepositoryError,
  TraceRepository | SessionRepository | SpanRepository | ChSqlClient
> =>
  Effect.gen(function* () {
    const organizationId = OrganizationId(params.organizationId)
    const projectId = ProjectId(params.projectId)
    const traceRepository = yield* TraceRepository
    const sessionRepository = yield* SessionRepository

    const distinctValues = (column: TraceDistinctColumn) =>
      traceRepository.distinctFilterValues({
        organizationId,
        projectId,
        column,
        limit: SIGNAL_GENERATION_DISTINCT_VALUES_LIMIT,
      })

    const { tags, serviceNames, models, providers, tools, definedTools } = yield* Effect.all(
      {
        tags: distinctValues("tags"),
        serviceNames: distinctValues("serviceNames"),
        models: distinctValues("models"),
        providers: distinctValues("providers"),
        tools: distinctValues("tools"),
        definedTools: distinctValues("definedTools"),
      },
      { concurrency: "unbounded" },
    )

    const histogram = yield* sessionRepository.histogramByProjectId({
      organizationId,
      projectId,
      bucketSeconds: DAY_SECONDS,
    })
    const window = histogram.slice(-TRAFFIC_WINDOW_DAYS)
    const avgSessionsPerDay =
      window.length === 0 ? 0 : window.reduce((sum, bucket) => sum + bucket.sessionCount, 0) / window.length

    const sessions = yield* sessionRepository.listByProjectId({
      organizationId,
      projectId,
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
        .findByTraceId({ organizationId, projectId, traceId: TraceId(anchorTraceId) })
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (traceDetail !== null) {
        const session = yield* loadScriptSessionContext({ organizationId, projectId, traceDetail })
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
  }).pipe(Effect.withSpan("signals.assembleSignalGenerationGrounding"))
