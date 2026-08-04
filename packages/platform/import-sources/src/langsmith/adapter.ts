import type {
  ImportConfig,
  ImportPreviewConfig,
  ImportSourceAdapter,
  LangsmithCredentials,
  NormalizeContext,
  NormalizeResult,
} from "@domain/imports"
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

interface LangsmithRun {
  // Optional because `normalize` treats a row with no id as unimportable.
  readonly id?: string
  readonly trace_id?: string
  readonly parent_run_id?: string | null
  readonly name?: string
  readonly run_type?: string
  readonly session_id?: string
  readonly start_time?: string
  readonly end_time?: string
  /** A timestamp, not a duration: TTFT is the gap from `start_time`. Null on non-streaming runs. */
  readonly first_token_time?: string | null
  readonly inputs?: unknown
  readonly outputs?: unknown
  readonly tags?: readonly string[]
  readonly extra?: {
    metadata?: Record<string, unknown>
    /** The tracing library and version, which is what an OTEL scope names. */
    runtime?: Record<string, unknown>
    /** The provider call's own arguments, where the model and its tools are declared. */
    invocation_params?: Record<string, unknown>
  }
  /** Streaming chunk events LangSmith records on the run. */
  readonly events?: readonly unknown[]
  readonly prompt_tokens?: number
  readonly completion_tokens?: number
  readonly total_tokens?: number
  /** Present when LangSmith priced the run itself; absent runs are priced from models.dev. */
  readonly prompt_cost?: number
  readonly completion_cost?: number
  readonly total_cost?: number
  readonly status?: string
  readonly error?: string
}

interface LangsmithCursor {
  readonly cursor: string
}

/**
 * `/runs/query` declares `limit` as `maximum: 100`, well below the shared `sourcePageSize`
 * ceiling, so an unclamped page size is rejected outright rather than truncated.
 */
const MAX_PAGE_SIZE = 100

const authHeaders = (credentials: LangsmithCredentials): Record<string, string> => ({
  "x-api-key": credentials.apiKey,
  "Content-Type": "application/json",
  // Scopes the key to one workspace on multi-workspace accounts; omitted entirely
  // when unset so single-workspace keys keep resolving their default tenant.
  ...(credentials.workspaceId ? { "x-tenant-id": credentials.workspaceId } : {}),
})

const runsQueryBody = (input: {
  readonly sourceProjectId: string
  readonly range: { readonly from: Date; readonly to: Date }
  readonly limit: number
  readonly cursor?: string
}): string =>
  JSON.stringify({
    session: [input.sourceProjectId],
    start_time: input.range.from.toISOString(),
    end_time: input.range.to.toISOString(),
    limit: Math.min(input.limit, MAX_PAGE_SIZE),
    // Newest first inside the window, so a capped import truncates at the oldest end.
    order: "desc",
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
  })

/**
 * Probed in order when the user has not named a session metadata key.
 *
 * Deliberately conversation-scoped keys only. `user_id` used to be the last entry, which made
 * every trace of one user collapse into a single session whenever no thread key was present —
 * measured at 5 of 12 traces on a realistic dataset, with two independent pairs fused. A user
 * id is not a conversation id; the final fallback below (the trace's own id, giving each trace
 * its own session) is the correct answer for a trace with no thread. Anyone who really does
 * key sessions by user can say so via `config.sessionMetadataKey`.
 */
const DEFAULT_SESSION_METADATA_KEYS = ["thread_id", "session_id", "conversation_id"] as const

/**
 * The run types LangSmith coined itself. The rest are OpenInference's span kinds in lower case, which
 * `resolveOperationFromSourceKind` case-folds.
 *
 * Both of these land on operations *outside* the rollup's token gate (`chat`, `text_completion`,
 * `generate_content`, `embeddings`, `reranker`), which matters for `parser`: LangSmith aggregates its
 * children's usage onto ancestor runs, so counting a wrapper would report a trace's tokens twice.
 */
const RUN_TYPE_OPERATION: Record<string, SpanDetail["operation"]> = {
  chat_model: "chat",
  parser: "chain",
}

/**
 * LangSmith returns timestamps with no timezone designator (`2026-07-28T12:00:00.726000`).
 * `new Date` reads a bare date-time as *local* time, so parsing one directly shifts every
 * imported span by the worker's UTC offset — zero on a UTC host, two hours on a European one,
 * and a different amount either side of a DST boundary.
 */
const parseUtc = (value: string): Date => new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)

/**
 * Traces in a window. `/runs/stats` with `is_root` counts root runs, which is one per trace —
 * the unit `maxTraces` budgets and billing charges.
 */
const countTraces = (input: {
  readonly baseUrl: string
  readonly headers: Record<string, string>
  readonly sourceProjectId: string
  readonly range: { readonly from: Date; readonly to: Date }
}): Effect.Effect<number | null, ImportSourceError> =>
  Effect.gen(function* () {
    const response = yield* httpRequest({
      url: `${input.baseUrl}/runs/stats`,
      headers: input.headers,
      method: "POST",
      body: JSON.stringify({
        session: [input.sourceProjectId],
        start_time: input.range.from.toISOString(),
        end_time: input.range.to.toISOString(),
        is_root: true,
      }),
    })
    const ok = yield* requireOk(response)
    const data = yield* parseJson<{ run_count?: number }>(ok)
    return typeof data.run_count === "number" ? data.run_count : null
  })

const resolveSessionId = (row: LangsmithRun, config: ImportPreviewConfig): string => {
  const metadata = row.extra?.metadata ?? {}
  const keys = config.sessionMetadataKey
    ? [config.sessionMetadataKey, ...DEFAULT_SESSION_METADATA_KEYS]
    : DEFAULT_SESSION_METADATA_KEYS
  for (const candidate of keys) {
    const value = metadata[candidate]
    if (typeof value === "string" && value.length > 0) return value
  }
  // Empty, not the run's trace id: the session rollup keys on
  // `coalesce(nullIf(session_id, ''), trace_id)`, so the grouping is the same either way, while a
  // synthetic id stores a trace with no conversation as if it had one. That is what tells a
  // multi-turn session apart from a standalone trace.
  return ""
}

const stringValue = (record: Record<string, unknown> | undefined, key: string): string =>
  typeof record?.[key] === "string" ? (record[key] as string) : ""

/**
 * The model, from LangChain's `ls_model_name` run metadata or, failing that, the arguments of
 * the provider call itself. A chain run wrapping an LLM call carries the second but not the first.
 */
/**
 * LangChain records the model in its own run metadata, and a run that reached LangSmith over OTLP
 * carries the OTEL attribute names instead, so the resolver reads both. `invocation_params` is the
 * request LangChain built and is not a metadata map at all, so it stays a separate read.
 */
const resolveModel = (row: LangsmithRun): string =>
  resolveModelFromMetadata(row.extra?.metadata, ["ls_model_name"]) ||
  stringValue(row.extra?.invocation_params, "model") ||
  stringValue(row.extra?.invocation_params, "model_name")

/**
 * Finish reasons out of a LangChain `LLMResult`, which nests them per generation under
 * `generations[][].generation_info.finish_reason`. Deduplicated, since one run can return
 * several generations that all stopped the same way.
 */
const resolveFinishReasons = (outputs: unknown): string[] => {
  if (!outputs || typeof outputs !== "object") return []
  const generations = (outputs as { generations?: unknown }).generations
  if (!Array.isArray(generations)) return []

  const reasons = new Set<string>()
  for (const generation of generations.flat()) {
    if (!generation || typeof generation !== "object") continue
    const info = (generation as { generation_info?: unknown }).generation_info
    const reason = info && typeof info === "object" ? (info as { finish_reason?: unknown }).finish_reason : undefined
    if (typeof reason === "string" && reason.length > 0) reasons.add(reason)
  }
  return [...reasons]
}

/**
 * Tool content unwrapped when the source encoded a string twice.
 *
 * LangSmith's OTLP receiver turns an OTEL tool result into OpenAI's `content`, which must be a
 * string, by JSON-encoding whatever it was — so a result that was already a string arrives wrapped
 * in quotes with its newlines escaped, and renders that way. Only a payload that parses to a string
 * is unwrapped: a JSON object result parses to an object and is left exactly as it came.
 */
const unwrapDoubleEncoded = (content: unknown): unknown => {
  if (typeof content !== "string") return content
  const trimmed = content.trim()
  if (!trimmed.startsWith('"')) return content
  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === "string" ? parsed : content
  } catch {
    return content
  }
}

const withUnwrappedToolContent = (payload: unknown): unknown => {
  if (Array.isArray(payload)) return payload.map(withUnwrappedToolContent)
  if (!payload || typeof payload !== "object") return payload

  const record = payload as Record<string, unknown>
  if (record.role === "tool" && "content" in record) {
    return { ...record, content: unwrapDoubleEncoded(record.content) }
  }
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, withUnwrappedToolContent(value)]))
}

const normalizeRun = (row: LangsmithRun, context: NormalizeContext, config: ImportConfig): NormalizeResult => {
  if (!row.id) return { status: "skip", reason: "missing id" }

  const traceSource = row.trace_id ?? row.id
  const metadata: Record<string, string> = {
    ...stringifyMetadata(row.extra?.metadata),
    "import.job_id": context.importJobId,
    "import.source": context.source,
    "import.source_project_id": context.sourceProjectId,
    "import.source_trace_id": traceSource,
    "import.source_span_id": row.id,
  }

  const startTime = row.start_time ? parseUtc(row.start_time) : context.ingestedAt
  const endTime = row.end_time ? parseUtc(row.end_time) : startTime

  const span: SpanDetail = buildSpanFromNormalized({
    organizationId: OrganizationId(context.organizationId),
    projectId: ProjectId(context.projectId),
    source: context.source,
    traceIdSource: traceSource,
    spanIdSource: row.id,
    parentSpanIdSource: row.parent_run_id ?? null,
    sessionId: resolveSessionId(row, config),
    userId: stringValue(row.extra?.metadata, "user_id"),
    userEmail: resolveUserEmailFromMetadata(row.extra?.metadata),
    name: row.name ?? row.run_type ?? "run",
    operation: resolveOperationFromSourceKind(row.run_type, RUN_TYPE_OPERATION),
    model: resolveModel(row),
    // `ls_provider` is LangChain's own run metadata, alongside `ls_model_name`, but a run that
    // arrived over OTLP keeps the OTEL attribute names instead, so resolve over the whole list.
    provider: resolveProviderFromMetadata(metadata),
    tags: [...(row.tags ?? [])],
    metadata,
    startTime,
    endTime,
    ...(row.first_token_time ? { firstTokenAt: parseUtc(row.first_token_time) } : {}),
    ingestedAt: context.ingestedAt,
    retentionDays: context.retentionDays,
    statusCode: row.status === "error" || row.error ? "error" : "ok",
    statusMessage: row.error ?? "",
    tokensInput: row.prompt_tokens ?? 0,
    tokensOutput: row.completion_tokens ?? 0,
    cost: { inputUsd: row.prompt_cost, outputUsd: row.completion_cost, totalUsd: row.total_cost },
    finishReasons: resolveFinishReasons(row.outputs),
    // `runtime.library` is the instrumentation that produced the run, which is what an OTEL
    // scope names — the same slot `langchain` would occupy arriving over OTLP.
    scopeName: stringValue(row.extra?.runtime, "library"),
    scopeVersion: stringValue(row.extra?.runtime, "library_version"),
    responseId: resolveResponseIdFromMetadata(row.extra?.metadata),
    toolsPayload: row.extra?.invocation_params,
    ...(row.events?.length ? { eventsJson: JSON.stringify(row.events) } : {}),
    input: withUnwrappedToolContent(row.inputs),
    output: withUnwrappedToolContent(row.outputs),
  })

  return { status: "ok", span }
}

export const createLangsmithAdapter = (): ImportSourceAdapter<LangsmithRun, LangsmithCursor> => ({
  source: "langsmith",

  testConnection: ({ credentials }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langsmith") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langsmith credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: `${importSourceBaseUrl(credentials)}/sessions?limit=1`,
        headers: authHeaders(credentials),
      })
      yield* requireOk(response)
    }),

  listProjects: ({ credentials, limit }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langsmith") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langsmith credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: `${importSourceBaseUrl(credentials)}/sessions?limit=${limit}`,
        headers: authHeaders(credentials),
      })
      const ok = yield* requireOk(response)
      const data = yield* parseJson<unknown>(ok)
      if (!Array.isArray(data)) {
        return yield* Effect.fail(
          new ImportSourceError({
            category: "mapping",
            message: "LangSmith returned an unexpected session list shape",
            retryable: false,
          }),
        )
      }
      const projects = (data as Array<{ id: string; name?: string; session_name?: string }>)
        .slice(0, limit)
        .map((p) => ({ id: p.id, name: p.name ?? p.session_name ?? p.id }))
      return { projects, nextCursor: null }
    }),

  preview: ({ credentials, sourceProjectId, config, range, maxRecords }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langsmith") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langsmith credentials", retryable: false }),
        )
      }
      const previewLimit = Math.min(maxRecords, IMPORT_PREVIEW_SAMPLE_LIMIT)
      const response = yield* httpRequest({
        url: `${importSourceBaseUrl(credentials)}/runs/query`,
        headers: authHeaders(credentials),
        method: "POST",
        body: runsQueryBody({ sourceProjectId, range, limit: previewLimit }),
      })
      const ok = yield* requireOk(response)
      const data = yield* parseJson<{ runs?: LangsmithRun[] }>(ok)
      // Only rows the import would actually keep belong in the sample.
      const rows = (data.runs ?? []).filter((row): row is LangsmithRun & { id: string } => Boolean(row.id))
      const sessionKey = config.sessionMetadataKey ?? DEFAULT_SESSION_METADATA_KEYS[0]
      const resolvedSessions = rows.filter((row) => resolveSessionId(row, config) !== "").length
      const estimatedTraces = yield* countTraces({
        baseUrl: importSourceBaseUrl(credentials),
        headers: authHeaders(credentials),
        sourceProjectId,
        range,
      })

      return {
        estimatedTraces,
        sample: sampleDistinctTraces(rows, (row) => ({
          traceId: row.trace_id ?? row.id,
          name: row.name ?? row.run_type ?? "run",
          model: resolveModelFromMetadata(row.extra?.metadata, ["ls_model_name"]),
          startTime: row.start_time ? parseUtc(row.start_time).toISOString() : "",
          endTime: row.end_time ? parseUtc(row.end_time).toISOString() : "",
        })),
        warnings: [
          ...(rows.length > 0 && resolvedSessions === 0
            ? [
                `No run in this sample carries \`extra.metadata.${sessionKey}\`, so each trace will import as its own session.`,
              ]
            : []),
          ...cappedWarning(estimatedTraces, config.maxTraces),
        ],
      }
    }),

  // Reads the origin off the job's snapshot rather than re-deriving it, so a job settled on
  // one region keeps talking to it for its whole page chain.
  fetchPage: ({ credentials, sourceProjectId, config, cursor, range, limit }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "langsmith") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected langsmith credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: `${config.sourceBaseUrl}/runs/query`,
        headers: authHeaders(credentials),
        method: "POST",
        body: runsQueryBody({
          sourceProjectId,
          range,
          limit,
          ...(cursor ? { cursor: cursor.cursor } : {}),
        }),
      })
      const ok = yield* requireOk(response)
      const data = yield* parseJson<{ runs?: LangsmithRun[]; cursors?: { next?: string | null } }>(ok)
      const rows = data.runs ?? []
      const nextCursor = data.cursors?.next ?? null

      // A full page with no continuation token would mean silently abandoning the rest of
      // this window, which reads as a clean import that quietly lost data. Fail instead.
      if (rows.length >= Math.min(limit, MAX_PAGE_SIZE) && !nextCursor) {
        return yield* Effect.fail(
          new ImportSourceError({
            category: "mapping",
            message: "LangSmith returned a full page without a pagination cursor",
            retryable: false,
          }),
        )
      }

      return {
        rows,
        nextCursor: nextCursor ? { cursor: nextCursor } : null,
        hasMore: nextCursor !== null,
      }
    }),

  normalize: (row, context, config) => normalizeRun(row, context, config),
})
