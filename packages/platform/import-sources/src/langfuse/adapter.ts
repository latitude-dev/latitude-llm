import type { ImportSourceAdapter, LangfuseCredentials, NormalizeContext, NormalizeResult } from "@domain/imports"
import { IMPORT_PREVIEW_SAMPLE_LIMIT, ImportSourceError, importSourceBaseUrl } from "@domain/imports"
import { OrganizationId, ProjectId } from "@domain/shared"
import type { SpanDetail } from "@domain/spans"
import {
  resolveModelFromMetadata,
  resolveOperationFromSourceKind,
  resolveProviderFromMetadata,
  resolveResponseIdFromMetadata,
  resolveUserEmailFromMetadata,
} from "@domain/spans"
import { Effect } from "effect"
import { buildSpanFromNormalized } from "../helpers/normalize-span.ts"
import { cappedWarning, sampleDistinctTraces } from "../helpers/trace-preview.ts"
import { httpRequest, parseJson, requireOk, stringifyMetadata } from "../http-client.ts"

/**
 * A `/v2/observations` row. Every field outside the `core` group is optional because v2
 * *omits* what the `fields` parameter did not ask for rather than nulling it, so a wrong
 * field list shows up as absent data rather than an error.
 */
interface LangfuseObservation {
  // Optional because `normalize` treats a row missing either id as unimportable.
  readonly id?: string
  readonly traceId?: string | null
  readonly parentObservationId?: string | null
  readonly type?: string
  readonly name?: string | null
  readonly sessionId?: string | null
  readonly userId?: string | null
  readonly startTime?: string
  readonly endTime?: string | null
  readonly input?: unknown
  readonly output?: unknown
  readonly metadata?: Record<string, unknown>
  readonly tags?: readonly string[] | null
  readonly usageDetails?: Record<string, number>
  readonly costDetails?: Record<string, number>
  /** The `usage` group's own cost split, which saves guessing at `costDetails` key names. */
  readonly inputCost?: number | null
  readonly outputCost?: number | null
  readonly totalCost?: number | null
  /** The model as sent by the caller. Both API versions call this `model`. */
  readonly model?: string | null
  /** What the `model` field group is documented to return; `model` is the observed key. */
  readonly providedModelName?: string | null
  readonly modelParameters?: Record<string, unknown> | null
  /** `time` group. The first output token's timestamp, so TTFT is the gap from `startTime`. */
  readonly completionStartTime?: string | null
  readonly promptId?: string | null
  readonly promptName?: string | null
  readonly promptVersion?: number | null
  readonly statusMessage?: string | null
  readonly level?: string
  readonly environment?: string | null
  readonly version?: string | null
  /** Attached by `fetchPage` from the trace list; see `traceContextFor`. */
  readonly traceContext?: LangfuseTraceContext
}

interface LangfuseTraceContext {
  readonly sessionId: string
  readonly userId: string
  readonly tags: readonly string[]
}

interface LangfuseTrace {
  readonly id?: string
  readonly sessionId?: string | null
  readonly userId?: string | null
  readonly tags?: readonly string[] | null
}

interface LangfuseCursor {
  readonly cursor: string
}

const OBSERVATIONS_PATH = "/api/public/v2/observations"
const TRACES_PATH = "/api/public/traces"
const PROJECTS_PATH = "/api/public/projects"

/**
 * The observation types Langfuse coined itself. The rest are OpenInference's span kinds, which
 * `resolveOperationFromSourceKind` resolves off that spec's own list.
 */
const OBSERVATION_OPERATION: Record<string, SpanDetail["operation"]> = {
  GENERATION: "chat",
  SPAN: "chain",
  // Known and deliberately unmapped: an event is a point in time, not work with usage to count.
  EVENT: "unspecified",
}

/**
 * The v2 field groups this adapter maps. `core` and `basic` are the defaults; the rest
 * have to be named or the response simply lacks them, which would import spans with no
 * content, metadata, model, usage or tags and look like a successful import.
 *
 * Groups and their contents, from the endpoint's documentation:
 * `core` id, traceId, startTime, endTime, parentObservationId, type · `basic` name, level,
 * statusMessage, version, environment, userId, sessionId · `time` completionStartTime ·
 * `io` input, output · `metadata` metadata · `model` providedModelName, internalModelId,
 * modelParameters · `usage` usageDetails, costDetails, inputCost, outputCost, totalCost ·
 * `prompt` promptId, promptName, promptVersion · `metrics` latency, timeToFirstToken ·
 * `trace_context` tags, release, traceName.
 *
 * `metrics` is left out on purpose: it publishes no unit for either duration, and TTFT derived
 * from `time`'s `completionStartTime` is a difference between two timestamps, so it cannot be
 * off by a factor of a thousand.
 */
const OBSERVATION_FIELDS = "core,basic,time,io,metadata,model,usage,prompt,trace_context"

/** v2 caps a page at 1000 rows, below the shared `sourcePageSize` ceiling. */
const MAX_PAGE_SIZE = 1_000

/**
 * The trace list caps `limit` at 100, an order of magnitude below the observation page, and
 * rejects anything larger with a 400 rather than clamping. Its own pagination covers a window
 * holding more.
 */
const TRACE_PAGE_SIZE = 100

/**
 * Trace-list pages read per observation page. Ten covers a full observation page even if every
 * row in it belongs to a different trace. Past that the excess keeps whatever session and user
 * the observation itself carries, which is what this adapter did before the join existed.
 */
const TRACE_CONTEXT_MAX_PAGES = Math.ceil(MAX_PAGE_SIZE / TRACE_PAGE_SIZE)

const observationParams = (input: {
  readonly range: { readonly from: Date; readonly to: Date }
  readonly limit: number
  readonly cursor?: string
}): URLSearchParams => {
  const params = new URLSearchParams({
    fields: OBSERVATION_FIELDS,
    limit: String(Math.min(input.limit, MAX_PAGE_SIZE)),
    fromStartTime: input.range.from.toISOString(),
    toStartTime: input.range.to.toISOString(),
  })
  if (input.cursor) params.set("cursor", input.cursor)
  return params
}

const authHeaders = (credentials: LangfuseCredentials): Record<string, string> => {
  const token = Buffer.from(`${credentials.publicKey}:${credentials.secretKey}`).toString("base64")
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
  }
}

const langfuseApiUrl = (baseUrl: string, path: string, params?: URLSearchParams): string => {
  const url = new URL(path, baseUrl)
  if (params) url.search = params.toString()
  return url.toString()
}

const traceParams = (input: {
  readonly range: { readonly from: Date; readonly to: Date }
  readonly limit: number
  readonly page?: number
}): URLSearchParams => {
  const params = new URLSearchParams({
    limit: String(Math.min(input.limit, TRACE_PAGE_SIZE)),
    fromTimestamp: input.range.from.toISOString(),
    toTimestamp: input.range.to.toISOString(),
  })
  if (input.page !== undefined) params.set("page", String(input.page))
  return params
}

/**
 * Session, user and tags for a window, read from the trace list.
 *
 * All three live on the trace. v2 does project them onto the observation — session and user via
 * `basic`, tags via `trace_context` — but the projection is unreliable in practice, measured at
 * one trace out of nine and unchanged after ten minutes, so an import that trusted it lost
 * session grouping, user attribution and tags for almost every trace. The trace list is
 * authoritative for all three because that is where they are actually stored.
 *
 * Pages until every trace in `wanted` is covered rather than reading a fixed slice, because a
 * window holds as many traces as it holds and the list caps a page at a tenth of the
 * observation page's size.
 */
const traceContextFor = (input: {
  readonly baseUrl: string
  readonly headers: Record<string, string>
  readonly range: { readonly from: Date; readonly to: Date }
  readonly wanted: ReadonlySet<string>
}): Effect.Effect<ReadonlyMap<string, LangfuseTraceContext>, ImportSourceError> =>
  Effect.gen(function* () {
    const contexts = new Map<string, LangfuseTraceContext>()
    if (input.wanted.size === 0) return contexts

    let totalPages = 1
    for (let page = 1; page <= Math.min(totalPages, TRACE_CONTEXT_MAX_PAGES); page += 1) {
      const response = yield* httpRequest({
        url: langfuseApiUrl(
          input.baseUrl,
          TRACES_PATH,
          traceParams({ range: input.range, limit: TRACE_PAGE_SIZE, page }),
        ),
        headers: input.headers,
      })
      const ok = yield* requireOk(response)
      const data = yield* parseJson<{ data?: LangfuseTrace[]; meta?: { totalPages?: number } }>(ok)

      for (const trace of data.data ?? []) {
        if (!trace.id || !input.wanted.has(trace.id)) continue
        contexts.set(trace.id, {
          sessionId: trace.sessionId ?? "",
          userId: trace.userId ?? "",
          tags: trace.tags ?? [],
        })
      }

      if (contexts.size === input.wanted.size) break
      totalPages = data.meta?.totalPages ?? page
    }

    if (contexts.size < input.wanted.size) {
      yield* Effect.logWarning("Langfuse trace context incomplete for this page", {
        wanted: input.wanted.size,
        resolved: contexts.size,
        pagesRead: TRACE_CONTEXT_MAX_PAGES,
      })
    }
    return contexts
  })

/**
 * The number of traces in a window, which is what `maxTraces` budgets and what billing
 * charges. `meta.totalItems` on the trace list is exact and costs a single row.
 */
const countTraces = (input: {
  readonly baseUrl: string
  readonly headers: Record<string, string>
  readonly range: { readonly from: Date; readonly to: Date }
}): Effect.Effect<number | null, ImportSourceError> =>
  Effect.gen(function* () {
    const response = yield* httpRequest({
      url: langfuseApiUrl(input.baseUrl, TRACES_PATH, traceParams({ range: input.range, limit: 1 })),
      headers: input.headers,
    })
    const ok = yield* requireOk(response)
    const data = yield* parseJson<{ meta?: { totalItems?: number } }>(ok)
    const total = data.meta?.totalItems
    return typeof total === "number" ? total : null
  })

const normalizeObservation = (row: LangfuseObservation, context: NormalizeContext): NormalizeResult => {
  if (!row.id || !row.traceId) {
    return { status: "skip", reason: "missing ids" }
  }

  const metadata: Record<string, string> = {
    ...stringifyMetadata(row.metadata),
    ...stringifyMetadata(row.modelParameters),
    "import.job_id": context.importJobId,
    "import.source": context.source,
    "import.source_project_id": context.sourceProjectId,
    "import.source_trace_id": row.traceId,
    "import.source_span_id": row.id,
  }
  if (row.promptName) metadata["import.prompt_name"] = row.promptName
  if (row.promptVersion) metadata["import.prompt_version"] = String(row.promptVersion)
  if (row.promptId) metadata["import.prompt_id"] = row.promptId
  if (row.environment) metadata["import.environment"] = row.environment
  if (row.version) metadata["import.version"] = row.version

  const startTime = row.startTime ? new Date(row.startTime) : context.ingestedAt
  const endTime = row.endTime ? new Date(row.endTime) : startTime

  // The trace list is the reliable source for these three; v2's own projection of them onto
  // an observation populates only sporadically. See `traceContextFor`.
  const traceContext = row.traceContext
  const span: SpanDetail = buildSpanFromNormalized({
    organizationId: OrganizationId(context.organizationId),
    projectId: ProjectId(context.projectId),
    source: context.source,
    traceIdSource: row.traceId,
    spanIdSource: row.id,
    parentSpanIdSource: row.parentObservationId ?? null,
    sessionId: traceContext?.sessionId ?? row.sessionId ?? "",
    userId: traceContext?.userId ?? row.userId ?? "",
    name: row.name ?? row.type ?? "observation",
    operation: resolveOperationFromSourceKind(row.type, OBSERVATION_OPERATION),
    // `model` is the key observed on both API versions; `providedModelName` is the one the v2
    // `model` field group documents. Reading both means neither doc nor observation can be the
    // single point of failure — an empty model column was one of the first bugs here.
    model: row.model ?? row.providedModelName ?? resolveModelFromMetadata(row.metadata),
    // Langfuse has no first-class provider field, so it comes from the metadata map, where an OTLP
    // export leaves the OTEL attributes under an `attributes.` prefix. Resolved over the same key
    // list ingest uses, because pricing falls back to estimating from provider + model whenever
    // Langfuse did not compute a cost itself.
    provider: resolveProviderFromMetadata(metadata),
    userEmail: resolveUserEmailFromMetadata(row.metadata),
    tags: [...(traceContext?.tags ?? row.tags ?? [])],
    metadata,
    startTime,
    endTime,
    ...(row.completionStartTime ? { firstTokenAt: new Date(row.completionStartTime) } : {}),
    ...(typeof row.modelParameters?.stream === "boolean" ? { isStreaming: row.modelParameters.stream } : {}),
    ingestedAt: context.ingestedAt,
    retentionDays: context.retentionDays,
    statusCode: row.level === "ERROR" ? "error" : "ok",
    statusMessage: row.statusMessage ?? "",
    tokensInput: row.usageDetails?.input ?? row.usageDetails?.promptTokens ?? 0,
    tokensOutput: row.usageDetails?.output ?? row.usageDetails?.completionTokens ?? 0,
    // Langfuse prices the call itself, so this is the provider's real cost rather than an
    // estimate. The `usage` group's own split is preferred over digging into `costDetails`,
    // whose keys are whatever the provider named its usage metrics.
    cost: {
      inputUsd: row.inputCost ?? row.costDetails?.input,
      outputUsd: row.outputCost ?? row.costDetails?.output,
      totalUsd: row.totalCost ?? row.costDetails?.total,
    },
    responseId: resolveResponseIdFromMetadata(row.metadata),
    toolsPayload: row.modelParameters,
    input: row.input,
    output: row.output,
  })

  return { status: "ok", span }
}

export const createLangfuseAdapter = (): ImportSourceAdapter<LangfuseObservation, LangfuseCursor> => ({
  source: "langfuse",

  testConnection: ({ credentials }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langfuse") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langfuse credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: langfuseApiUrl(importSourceBaseUrl(credentials), PROJECTS_PATH),
        headers: authHeaders(credentials),
      })
      yield* requireOk(response)
    }),

  listProjects: ({ credentials, limit }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langfuse") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langfuse credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: langfuseApiUrl(importSourceBaseUrl(credentials), PROJECTS_PATH),
        headers: authHeaders(credentials),
      })
      const ok = yield* requireOk(response)
      const data = yield* parseJson<{ data?: Array<{ id: string; name: string }> }>(ok)
      const projects = (data.data ?? []).slice(0, limit).map((p) => ({ id: p.id, name: p.name }))
      return { projects, nextCursor: null }
    }),

  // No project parameter: a Langfuse public key is scoped to one project, which is what
  // `listProjects` lists and what the user picked, so the key itself selects it.
  preview: ({ credentials, config, range, maxRecords }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langfuse") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langfuse credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: langfuseApiUrl(
          importSourceBaseUrl(credentials),
          OBSERVATIONS_PATH,
          observationParams({ range, limit: Math.min(maxRecords, IMPORT_PREVIEW_SAMPLE_LIMIT) }),
        ),
        headers: authHeaders(credentials),
      })
      const ok = yield* requireOk(response)
      const data = yield* parseJson<{ data?: LangfuseObservation[] }>(ok)
      // Only rows the import would actually keep belong in the sample.
      const rows = (data.data ?? []).filter((row): row is LangfuseObservation & { id: string; traceId: string } =>
        Boolean(row.id && row.traceId),
      )
      const baseUrl = importSourceBaseUrl(credentials)
      const headers = authHeaders(credentials)
      const estimatedTraces = yield* countTraces({ baseUrl, headers, range })

      return {
        estimatedTraces,
        sample: sampleDistinctTraces(rows, (row) => ({
          traceId: row.traceId,
          name: row.name ?? row.type ?? "observation",
          model: row.model ?? "",
          startTime: row.startTime ?? "",
          endTime: row.endTime ?? "",
        })),
        warnings: cappedWarning(estimatedTraces, config.maxTraces),
      }
    }),

  // Reads the origin off the job's snapshot rather than re-deriving it, so a job settled on
  // one region keeps talking to it for its whole page chain.
  fetchPage: ({ credentials, config, cursor, range, limit }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langfuse") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langfuse credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: langfuseApiUrl(
          config.sourceBaseUrl,
          OBSERVATIONS_PATH,
          observationParams({ range, limit, ...(cursor ? { cursor: cursor.cursor } : {}) }),
        ),
        headers: authHeaders(credentials),
      })
      const ok = yield* requireOk(response)
      const data = yield* parseJson<{ data?: LangfuseObservation[]; meta?: { cursor?: string | null } }>(ok)
      const rows = data.data ?? []
      const nextCursor = data.meta?.cursor ?? null

      // A full page with no continuation token would mean silently abandoning the rest of
      // this window, which reads as a clean import that quietly lost data. Fail instead.
      if (rows.length >= Math.min(limit, MAX_PAGE_SIZE) && !nextCursor) {
        return yield* Effect.fail(
          new ImportSourceError({
            category: "mapping",
            message: "Langfuse returned a full page without a pagination cursor",
            retryable: false,
          }),
        )
      }

      const contexts = yield* traceContextFor({
        baseUrl: config.sourceBaseUrl,
        headers: authHeaders(credentials),
        range,
        wanted: new Set(rows.flatMap((row) => (row.traceId ? [row.traceId] : []))),
      })

      return {
        rows: rows.map((row) => {
          const context = row.traceId ? contexts.get(row.traceId) : undefined
          return context ? { ...row, traceContext: context } : row
        }),
        nextCursor: nextCursor ? { cursor: nextCursor } : null,
        hasMore: nextCursor !== null,
      }
    }),

  normalize: (row, context) => normalizeObservation(row, context),
})
