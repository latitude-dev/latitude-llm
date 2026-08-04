import type { BraintrustCredentials, ImportSourceAdapter, NormalizeContext, NormalizeResult } from "@domain/imports"
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
import { httpRequest, httpRequestBinary, parseJson, requireOk, stringifyMetadata } from "../http-client.ts"

interface BraintrustSpan {
  readonly root_span_id?: string
  // Optional because `normalize` treats a row with no span id as unimportable.
  readonly span_id?: string
  /**
   * Braintrust's parent link, and an array because it allows more than one. There is no
   * scalar `parent_span_id` in the schema — reading one left every span parentless, which
   * flattened every trace and made the engine count each span as its own trace.
   */
  readonly span_parents?: readonly string[] | null
  readonly span_attributes?: { name?: string; type?: string }
  readonly input?: unknown
  readonly output?: unknown
  readonly metadata?: Record<string, unknown>
  readonly tags?: readonly string[]
  /**
   * `start`, `end`, `prompt_tokens`, `completion_tokens`, `tokens`, `prompt_cached_tokens`,
   * `prompt_cache_creation_tokens`, `completion_reasoning_tokens`, `time_to_first_token`,
   * `estimated_cost`. Durations are seconds, matching `start`/`end`.
   */
  readonly metrics?: Record<string, number>
  readonly created?: string
  readonly is_root?: boolean
  readonly error?: unknown
  /** Required to ask for an attachment, and the same for every row of a project's page. */
  readonly org_id?: string
}

/**
 * The span types Braintrust coined itself; `llm` and `tool` it took from OpenInference, which
 * `resolveOperationFromSourceKind` resolves off that spec's own list.
 *
 * `task` wraps its children, so it stays outside the rollup's token gate for the same reason
 * LangSmith's wrappers do. Braintrust's set is closed — `llm`, `score`, `function`, `eval`, `task`,
 * `tool`, `review` — so an unmapped value means Braintrust added one.
 */
const SPAN_TYPE_OPERATION: Record<string, SpanDetail["operation"]> = {
  task: "invoke_agent",
  function: "execute_tool",
  score: "evaluator",
  eval: "evaluator",
  review: "evaluator",
}

interface BraintrustCursor {
  readonly cursor: string
}

/**
 * BTQL publishes no page ceiling, and a query that overruns its 30s budget fails rather
 * than truncating, so this is the width Braintrust's own pagination examples use. Asking
 * for exactly what we compare against is what keeps the missing-cursor guard below honest.
 */
const MAX_PAGE_SIZE = 1_000

const authHeaders = (credentials: BraintrustCredentials): Record<string, string> => ({
  Authorization: `Bearer ${credentials.apiKey}`,
  "Content-Type": "application/json",
})

const SAFE_PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/
/** Base64url plus padding — the shape of a BTQL continuation token. */
const SAFE_CURSOR = /^[A-Za-z0-9_\-+/=]{1,4096}$/

/**
 * BTQL has no parameter binding, so the project id is concatenated into the query
 * text. Allow-list it rather than escaping: anything outside this charset cannot
 * terminate the quoted literal and smuggle in clauses.
 *
 * `shape` is pinned because Braintrust documents no default for it: `traces` returns every
 * span of any matching trace and `summary` returns rollups with no `span_id` at all, either
 * of which would silently change what a page contains and what `normalize` can map.
 */
const projectLogsSource = (sourceProjectId: string): Effect.Effect<string, ImportSourceError> =>
  SAFE_PROJECT_ID.test(sourceProjectId)
    ? Effect.succeed(`project_logs('${sourceProjectId}', shape => 'spans')`)
    : Effect.fail(
        new ImportSourceError({
          category: "config",
          message: "Braintrust project id must be alphanumeric with dashes or underscores",
          retryable: false,
        }),
      )

/** Same reasoning as the project id: the token is composed into the query, so allow-list it. */
const offsetClause = (cursor: BraintrustCursor | null): Effect.Effect<string, ImportSourceError> => {
  if (!cursor) return Effect.succeed("")
  if (!SAFE_CURSOR.test(cursor.cursor)) {
    return Effect.fail(
      new ImportSourceError({
        category: "mapping",
        message: "Braintrust returned a pagination cursor with unexpected characters",
        retryable: false,
      }),
    )
  }
  return Effect.succeed(` offset '${cursor.cursor}'`)
}

/**
 * Newest first inside the window, so a capped import truncates at the oldest end. Without the
 * sort BTQL returns rows in whatever order it likes, which made the engine's newest-first
 * guarantee only as fine-grained as a window — and windows widen up to 32 days over sparse
 * history.
 */
const btqlWindow = (range: { readonly from: Date; readonly to: Date }): string =>
  `where created >= '${range.from.toISOString()}' and created <= '${range.to.toISOString()}' order by created desc`

/**
 * `metrics.start` and `metrics.end` are Braintrust's span boundaries, as fractional Unix
 * seconds. They are what gives an imported span a duration — `created` is the log write
 * time, so falling back to it for both ends renders every span as 0ms.
 */
const metricTime = (seconds: number | undefined): Date | undefined =>
  typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined

const NS_PER_SECOND = 1_000_000_000

const metricCount = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0

/**
 * Braintrust's token counts, converted to the additive breakdown `SpanDetail` stores.
 *
 * Braintrust documents the convention: `prompt_tokens` **includes** `prompt_cached_tokens` and
 * `prompt_cache_creation_tokens`, so storing it as-is alongside the cache columns would count
 * those tokens twice — once in the input total the trace rollup bills on and once in the cache
 * columns. `completion_tokens` includes `completion_reasoning_tokens` on the same reasoning,
 * matching what the ingest resolver assumes for every provider but Vertex.
 */
const resolveTokens = (metrics: Record<string, number> | undefined) => {
  const cacheRead = metricCount(metrics?.prompt_cached_tokens)
  const cacheCreate = metricCount(metrics?.prompt_cache_creation_tokens)
  const reasoning = metricCount(metrics?.completion_reasoning_tokens)

  return {
    tokensInput: Math.max(0, metricCount(metrics?.prompt_tokens) - cacheRead - cacheCreate),
    tokensOutput: Math.max(0, metricCount(metrics?.completion_tokens) - reasoning),
    tokensCacheRead: cacheRead,
    tokensCacheCreate: cacheCreate,
    tokensReasoning: reasoning,
  }
}

/**
 * Traces in a window. BTQL has no count endpoint but it does aggregate, and one root span per
 * trace means `count(distinct root_span_id)` is the trace count — the unit `maxTraces` budgets
 * and billing charges.
 */
const countTraces = (input: {
  readonly baseUrl: string
  readonly headers: Record<string, string>
  readonly from: string
  readonly range: { readonly from: Date; readonly to: Date }
}): Effect.Effect<number | null, ImportSourceError> =>
  Effect.gen(function* () {
    const response = yield* httpRequest({
      url: `${input.baseUrl}/btql`,
      headers: input.headers,
      method: "POST",
      body: JSON.stringify({
        query:
          `select count(distinct root_span_id) as traces from ${input.from} ` +
          `where created >= '${input.range.from.toISOString()}' and created <= '${input.range.to.toISOString()}'`,
      }),
    })
    const ok = yield* requireOk(response, "Braintrust count traces")
    const data = yield* parseJson<{ data?: Array<{ traces?: number }> }>(ok)
    const total = data.data?.[0]?.traces
    return typeof total === "number" ? total : null
  })

/**
 * Braintrust's `error` is free-form — a string for a raised message, an object for a structured
 * failure — so anything non-empty means the span failed. Reporting these as successful hid every
 * error in an imported history, and error rate is the first thing anyone checks after a migration.
 */
const errorMessageOf = (error: unknown): string => {
  if (error === null || error === undefined) return ""
  if (typeof error === "string") return error
  try {
    const encoded = JSON.stringify(error)
    return encoded === undefined || encoded === "{}" || encoded === "null" ? "" : encoded
  } catch {
    return "Braintrust reported an error that could not be decoded"
  }
}

/**
 * The exception class behind a structured error, so the errored-span breakdown groups by cause
 * rather than lumping everything under a single label. A string error carries no type.
 */
const errorTypeOf = (error: unknown): string => {
  if (!error || typeof error !== "object" || Array.isArray(error)) return ""
  const record = error as Record<string, unknown>
  for (const key of ["type", "name", "code"]) {
    const value = record[key]
    if (typeof value === "string" && value.length > 0) return value
  }
  return ""
}

/** Braintrust's own scheme for an attachment it stored out of line, keyed rather than inlined. */
const BRAINTRUST_ATTACHMENT_URI_SCHEME = "braintrust-attachment"

const BRAINTRUST_ATTACHMENT_TYPE = "braintrust_attachment"

/**
 * What Latitude will inline, and how many of them one page will go and get.
 *
 * The bytes land base64 in the span's own content, which is read whole every time the trace is
 * opened, and each attachment costs two requests inside the engine's 2-minute page budget — on
 * top of the page's own. Past either limit the attachment keeps its reference instead.
 */
const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024
const ATTACHMENT_MAX_PER_PAGE = 50
const ATTACHMENT_FETCH_CONCURRENCY = 4

interface BraintrustAttachment {
  readonly key: string
  readonly filename: string
  readonly contentType: string
}

const asAttachment = (value: unknown): BraintrustAttachment | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.type !== BRAINTRUST_ATTACHMENT_TYPE || typeof record.key !== "string" || !record.key) return undefined

  return {
    key: record.key,
    filename: typeof record.filename === "string" ? record.filename : "",
    contentType: typeof record.content_type === "string" ? record.content_type : "",
  }
}

/** Keyed, so an image replayed through every turn of a conversation is fetched once. */
const collectAttachments = (payload: unknown, into: Map<string, BraintrustAttachment>): void => {
  const attachment = asAttachment(payload)
  if (attachment) {
    into.set(attachment.key, attachment)
    return
  }
  if (Array.isArray(payload)) {
    for (const item of payload) collectAttachments(item, into)
    return
  }
  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload as Record<string, unknown>)) collectAttachments(value, into)
  }
}

/**
 * One attachment's bytes as base64, or `null` for anything that did not come back cleanly.
 *
 * Braintrust hands out a presigned URL rather than the bytes, and reports the size with it — which
 * is what lets an oversized attachment be declined before it is transferred rather than after.
 *
 * Nothing here fails the page. An attachment that cannot be fetched keeps the reference it already
 * had, which is a worse rendering of one message, not a reason to abandon a page of spans.
 */
const attachmentContent = (input: {
  readonly baseUrl: string
  readonly headers: Record<string, string>
  readonly orgId: string
  readonly attachment: BraintrustAttachment
}): Effect.Effect<string | null> =>
  Effect.gen(function* () {
    const query = new URLSearchParams({
      key: input.attachment.key,
      filename: input.attachment.filename,
      content_type: input.attachment.contentType,
      org_id: input.orgId,
    })
    const response = yield* httpRequest({ url: `${input.baseUrl}/attachment?${query}`, headers: input.headers })
    const ok = yield* requireOk(response, "Braintrust attachment")
    const meta = yield* parseJson<{
      downloadUrl?: string
      contentLength?: number
      status?: { upload_status?: string }
    }>(ok)

    // A half-written upload would download as a truncated file that renders as a broken one.
    if (meta.status?.upload_status !== "done") return null
    if (!meta.downloadUrl) return null
    if (typeof meta.contentLength !== "number" || meta.contentLength > ATTACHMENT_MAX_BYTES) return null

    const download = yield* httpRequestBinary({ url: meta.downloadUrl })
    if (download.status !== 200) return null

    return Buffer.from(download.bytes).toString("base64")
  }).pipe(Effect.orElseSucceed(() => null))

/**
 * Resolved attachments swapped in for the references that stood in for them, as data URLs.
 *
 * A data URL is a string, so the payload stays in the OpenAI dialect Braintrust wrote it in, and
 * that dialect's translator decodes one into the GenAI part for inline binary with its mime type.
 * Writing the binary part in directly instead loses that mime: a payload holding a tool exchange
 * translates by a route that keeps a part's `type` and `content` and drops every field beside them.
 */
const withInlinedAttachments = (payload: unknown, contentByKey: ReadonlyMap<string, string>): unknown => {
  if (Array.isArray(payload)) return payload.map((item) => withInlinedAttachments(item, contentByKey))
  if (!payload || typeof payload !== "object") return payload

  const record = payload as Record<string, unknown>
  const attachment = asAttachment((record.image_url as Record<string, unknown> | undefined)?.url)
  const content = attachment ? contentByKey.get(attachment.key) : undefined
  if (attachment && content) {
    const mime = attachment.contentType || "application/octet-stream"
    return { ...record, image_url: { url: `data:${mime};base64,${content}` } }
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, withInlinedAttachments(value, contentByKey)]),
  )
}

/**
 * A page whose out-of-line attachments have been fetched and inlined.
 *
 * Braintrust pulls inline binary out of a span on ingestion, uploads it, and leaves a reference in
 * its place — and on that side of the span it then drops the source attribute too, so the bytes
 * exist nowhere an import can read without asking for them. Fetching them here is what makes an
 * imported image renderable rather than a pointer into an account Latitude will not have a key for
 * once the job finishes.
 */
const withPageAttachments = (input: {
  readonly rows: readonly BraintrustSpan[]
  readonly baseUrl: string
  readonly headers: Record<string, string>
}): Effect.Effect<readonly BraintrustSpan[]> =>
  Effect.gen(function* () {
    const attachments = new Map<string, BraintrustAttachment>()
    for (const row of input.rows) {
      collectAttachments(row.input, attachments)
      collectAttachments(row.output, attachments)
    }
    if (attachments.size === 0) return input.rows

    // Required alongside the key, and a page comes from one project, so any row that carries it
    // carries the same one.
    const orgId = input.rows.find((row) => typeof row.org_id === "string" && row.org_id)?.org_id
    if (!orgId) return input.rows

    const wanted = [...attachments.values()].slice(0, ATTACHMENT_MAX_PER_PAGE)
    const fetched = yield* Effect.forEach(
      wanted,
      (attachment) =>
        attachmentContent({ baseUrl: input.baseUrl, headers: input.headers, orgId, attachment }).pipe(
          Effect.map((content) => [attachment.key, content] as const),
        ),
      { concurrency: ATTACHMENT_FETCH_CONCURRENCY },
    )
    const contentByKey = new Map(
      fetched.filter((entry): entry is readonly [string, string] => entry[1] !== null).map(([key, c]) => [key, c]),
    )

    if (contentByKey.size < attachments.size) {
      yield* Effect.logWarning("Braintrust attachments left as references for this page", {
        found: attachments.size,
        inlined: contentByKey.size,
        perPageLimit: ATTACHMENT_MAX_PER_PAGE,
        maxBytes: ATTACHMENT_MAX_BYTES,
      })
    }

    return input.rows.map((row) => ({
      ...row,
      input: withInlinedAttachments(row.input, contentByKey),
      output: withInlinedAttachments(row.output, contentByKey),
    }))
  })

/**
 * What is left of an attachment `withPageAttachments` could not inline: its key, as a URI string.
 *
 * Braintrust puts an object where OpenAI's schema wants a string at `image_url.url`, and that one
 * field makes the whole payload invalid OpenAI — the translator cannot place the dialect and falls
 * through to its lossy last resort, which drops the attachment and leaves an empty message behind.
 * A string keeps the payload identifiable and the message whole.
 *
 * The URI cannot be opened from Latitude. It stands for "there was an image here" and nothing more,
 * which is why fetching the bytes is tried first.
 */
const withResolvableAttachments = (payload: unknown): unknown => {
  if (Array.isArray(payload)) return payload.map(withResolvableAttachments)
  if (!payload || typeof payload !== "object") return payload

  const record = payload as Record<string, unknown>
  const attachment = asAttachment((record.image_url as Record<string, unknown> | undefined)?.url)
  if (record.type === "image_url" && attachment) {
    return { ...record, image_url: { url: `${BRAINTRUST_ATTACHMENT_URI_SCHEME}:${attachment.key}` } }
  }

  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, withResolvableAttachments(value)]))
}

/**
 * Braintrust's lossless copy of a model call's messages, where the row still carries one.
 *
 * It maps `gen_ai.{input,output}.messages` into `input` and `output`, flattening each message to
 * OpenAI's `{role, content}` shape — which silently discards any part it does not model. A
 * reasoning part is the one that hurts: a thinking model's whole rationale is absent from the
 * column, and nothing else in the row holds it. The source attribute is that same content before
 * the conversion, and it survives on `metadata` when the span asked Braintrust to keep it
 * (`braintrust.otel.preserve_attributes`) or the deployment does not strip mapped attributes, so
 * prefer it wherever it is there.
 */
const preservedMessages = (metadata: Record<string, unknown> | undefined, key: string): unknown => {
  const value = metadata?.[key]
  if (typeof value === "string") return value.trim() ? value : undefined
  return Array.isArray(value) && value.length > 0 ? value : undefined
}

const normalizeSpan = (row: BraintrustSpan, context: NormalizeContext): NormalizeResult => {
  if (!row.span_id) return { status: "skip", reason: "missing span_id" }

  const traceSource = row.root_span_id ?? row.span_id
  const metadata: Record<string, string> = {
    ...stringifyMetadata(row.metadata),
    "import.job_id": context.importJobId,
    "import.source": context.source,
    "import.source_project_id": context.sourceProjectId,
    "import.source_trace_id": traceSource,
    "import.source_span_id": row.span_id,
  }

  // Empty rather than the root's own span id when Braintrust carries no session. The session
  // rollup reads `coalesce(nullIf(session_id, ''), trace_id)`, so giving only the root an id
  // split one trace across two sessions: the root under its span id, its children under the
  // trace id. Leaving it empty puts the whole trace in one session keyed by the trace, which
  // is what "no session" should mean — and matches the LangSmith adapter's final fallback.
  const sessionId = typeof row.metadata?.session_id === "string" ? row.metadata.session_id : ""

  const startTime = metricTime(row.metrics?.start) ?? (row.created ? new Date(row.created) : context.ingestedAt)
  const endTime = metricTime(row.metrics?.end) ?? startTime
  const errorMessage = errorMessageOf(row.error)

  const span: SpanDetail = buildSpanFromNormalized({
    organizationId: OrganizationId(context.organizationId),
    projectId: ProjectId(context.projectId),
    source: context.source,
    traceIdSource: traceSource,
    spanIdSource: row.span_id,
    parentSpanIdSource: row.span_parents?.[0] ?? null,
    sessionId,
    userId: typeof row.metadata?.user_id === "string" ? row.metadata.user_id : "",
    name: row.span_attributes?.name ?? row.span_attributes?.type ?? "span",
    operation: resolveOperationFromSourceKind(row.span_attributes?.type, SPAN_TYPE_OPERATION),
    model: resolveModelFromMetadata(row.metadata),
    provider: resolveProviderFromMetadata(metadata),
    // Braintrust has no request-parameters field. Its own OpenAI-shaped rewrite of the tool set
    // lives here; the OTEL attribute beside it is read by the builder, for every source.
    toolsPayload: row.metadata?.tools,
    userEmail: resolveUserEmailFromMetadata(row.metadata),
    tags: [...(row.tags ?? [])],
    metadata,
    startTime,
    endTime,
    // Seconds, like the `start` and `end` metrics it sits beside. A value that turns out longer
    // than the span is dropped by the builder rather than stored.
    timeToFirstTokenNs: Math.round(metricCount(row.metrics?.time_to_first_token) * NS_PER_SECOND),
    ingestedAt: context.ingestedAt,
    retentionDays: context.retentionDays,
    statusCode: errorMessage ? "error" : "ok",
    statusMessage: errorMessage,
    ...(errorTypeOf(row.error) ? { errorType: errorTypeOf(row.error) } : {}),
    tokens: resolveTokens(row.metrics),
    // Braintrust prices the call itself and uses `estimated_cost` as-is in its own UI, so it is
    // the figure to carry over — it may follow pricing rules for a custom model that no public
    // table knows. It breaks out no sides, and leaving them out is what lets them be estimated
    // beside its total rather than stored as two zeros claiming both halves were free.
    cost: { totalUsd: row.metrics?.estimated_cost },
    responseId: resolveResponseIdFromMetadata(row.metadata),
    input: withResolvableAttachments(preservedMessages(row.metadata, "gen_ai.input.messages") ?? row.input),
    output: withResolvableAttachments(preservedMessages(row.metadata, "gen_ai.output.messages") ?? row.output),
  })

  return { status: "ok", span }
}

export const createBraintrustAdapter = (): ImportSourceAdapter<BraintrustSpan, BraintrustCursor> => ({
  source: "braintrust",

  testConnection: ({ credentials }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "braintrust") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected braintrust credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: `${importSourceBaseUrl(credentials)}/v1/project?limit=1`,
        headers: authHeaders(credentials),
      })
      yield* requireOk(response, "Braintrust connection test")
    }),

  listProjects: ({ credentials, limit }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "braintrust") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected braintrust credentials", retryable: false }),
        )
      }
      const response = yield* httpRequest({
        url: `${importSourceBaseUrl(credentials)}/v1/project?limit=${limit}`,
        headers: authHeaders(credentials),
      })
      const ok = yield* requireOk(response, "Braintrust list projects")
      const data = yield* parseJson<{ objects?: Array<{ id: string; name: string }> }>(ok)
      const projects = (data.objects ?? []).slice(0, limit).map((p) => ({ id: p.id, name: p.name }))
      return { projects, nextCursor: null }
    }),

  preview: ({ credentials, sourceProjectId, config, range, maxRecords }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "braintrust") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected braintrust credentials", retryable: false }),
        )
      }
      const from = yield* projectLogsSource(sourceProjectId)
      const previewLimit = Math.min(maxRecords, IMPORT_PREVIEW_SAMPLE_LIMIT)
      const response = yield* httpRequest({
        url: `${importSourceBaseUrl(credentials)}/btql`,
        headers: authHeaders(credentials),
        method: "POST",
        body: JSON.stringify({
          query: `select * from ${from} ${btqlWindow(range)} limit ${previewLimit}`,
        }),
      })
      const ok = yield* requireOk(response, "Braintrust preview")
      const data = yield* parseJson<{ data?: BraintrustSpan[] }>(ok)
      // Only rows the import would actually keep belong in the sample.
      const rows = (data.data ?? []).filter((row): row is BraintrustSpan & { span_id: string } => Boolean(row.span_id))
      const estimatedTraces = yield* countTraces({
        baseUrl: importSourceBaseUrl(credentials),
        headers: authHeaders(credentials),
        from,
        range,
      })

      return {
        estimatedTraces,
        sample: sampleDistinctTraces(rows, (row) => ({
          traceId: row.root_span_id ?? row.span_id,
          spanId: row.span_id,
          name: row.span_attributes?.name ?? "span",
          sessionId: typeof row.metadata?.session_id === "string" ? row.metadata.session_id : "",
          userId: typeof row.metadata?.user_id === "string" ? row.metadata.user_id : "",
          operation: resolveOperationFromSourceKind(row.span_attributes?.type, SPAN_TYPE_OPERATION),
          model: resolveModelFromMetadata(row.metadata),
          tags: row.tags ?? [],
          startTime:
            (metricTime(row.metrics?.start) ?? (row.created ? new Date(row.created) : undefined))?.toISOString() ?? "",
        })),
        warnings: cappedWarning(estimatedTraces, config.maxTraces),
      }
    }),

  // Reads the origin off the job's snapshot rather than re-deriving it, so a job settled on
  // one region keeps talking to it for its whole page chain.
  fetchPage: ({ credentials, sourceProjectId, config, cursor, range, limit }) =>
    Effect.gen(function* () {
      if (credentials.kind !== "braintrust") {
        return yield* Effect.fail(
          new ImportSourceError({ category: "config", message: "Expected braintrust credentials", retryable: false }),
        )
      }
      const from = yield* projectLogsSource(sourceProjectId)
      const offset = yield* offsetClause(cursor)
      const pageSize = Math.min(limit, MAX_PAGE_SIZE)
      const response = yield* httpRequest({
        url: `${config.sourceBaseUrl}/btql`,
        headers: authHeaders(credentials),
        method: "POST",
        body: JSON.stringify({
          query: `select * from ${from} ${btqlWindow(range)} limit ${pageSize}${offset}`,
        }),
      })
      const ok = yield* requireOk(response, "Braintrust fetch page")
      const data = yield* parseJson<{ data?: BraintrustSpan[]; cursor?: string | null }>(ok)
      const rows = yield* withPageAttachments({
        rows: data.data ?? [],
        baseUrl: config.sourceBaseUrl,
        headers: authHeaders(credentials),
      })
      const nextCursor = data.cursor ?? null

      // A full page with no continuation token would mean silently abandoning the rest of
      // this window, which reads as a clean import that quietly lost data. Fail instead.
      if (rows.length >= pageSize && !nextCursor) {
        return yield* Effect.fail(
          new ImportSourceError({
            category: "mapping",
            message: "Braintrust returned a full page without a pagination cursor",
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

  normalize: (row, context) => normalizeSpan(row, context),
})
