import { SpanId } from "@domain/shared"
import { Effect } from "effect"
import type { ImportConfig } from "../entities/import-source.ts"
import type { ImportSourceError } from "../errors.ts"
import type {
  FetchPageInput,
  ImportPreview,
  ImportSourceAdapter,
  ImportSourceAdapterRegistry,
  NormalizeContext,
  NormalizeResult,
  SourceProject,
} from "../ports/import-source-adapter.ts"
import { stubSpanDetail } from "./fakes.ts"

export interface FakeImportRow {
  readonly sourceTraceId: string
  readonly sourceSpanId: string
  readonly name: string
  readonly startTime: Date
  /** One per trace, so the engine's root-span trace counter has something to count. */
  readonly isRoot: boolean
}

export interface FakeCursor {
  readonly page: number
}

/** Newest fixture row. Rows walk backwards from here, matching how sources are read. */
export const FAKE_ROWS_LATEST = new Date("2026-01-20T12:00:00Z")

const MINUTE_MS = 60_000

export interface FakeAdapterOptions {
  readonly rows?: readonly FakeImportRow[]
  /** Fails the nth `fetchPage` call (1-based), letting tests drive the error branches. */
  readonly failOn?: { readonly call: number; readonly error: ImportSourceError }
  /** `sourceSpanId`s that `normalize` reports as skipped rather than mapping. */
  readonly skip?: readonly string[]
  /** Never resolves, so tests can exercise the page timeout. */
  readonly hang?: boolean
  /** Message content stamped onto every normalized span, so redaction has something to strip. */
  readonly content?: { readonly input?: string; readonly output?: string }
}

const FAKE_PROJECTS: readonly SourceProject[] = [
  { id: "fake-project-1", name: "Fake Project One" },
  { id: "fake-project-2", name: "Fake Project Two" },
]

export const fakeImportRows = (
  count: number,
  options: { readonly spansPerTrace?: number; readonly spacingMs?: number; readonly latest?: Date } = {},
): readonly FakeImportRow[] => {
  const spansPerTrace = options.spansPerTrace ?? 5
  const spacingMs = options.spacingMs ?? MINUTE_MS
  const latest = options.latest ?? FAKE_ROWS_LATEST

  return Array.from({ length: count }, (_, i) => ({
    sourceTraceId: `trace-${Math.floor(i / spansPerTrace)}`,
    sourceSpanId: `span-${i}`,
    name: `fake-span-${i}`,
    startTime: new Date(latest.getTime() - i * spacingMs),
    isRoot: i % spansPerTrace === 0,
  }))
}

export const createFakeImportAdapter = (options: FakeAdapterOptions = {}) => {
  const rows = options.rows ?? fakeImportRows(25)
  const skip = new Set(options.skip ?? [])
  const fetchPageCalls: FetchPageInput<FakeCursor>[] = []

  const adapter: ImportSourceAdapter<FakeImportRow, FakeCursor> = {
    source: "langfuse",

    testConnection: () => Effect.void,

    listProjects: ({ limit }) => Effect.succeed({ projects: FAKE_PROJECTS.slice(0, limit), nextCursor: null }),

    preview: ({ config }) => {
      const preview: ImportPreview = {
        estimatedTraces: new Set(rows.map((row) => row.sourceTraceId)).size,
        sample: rows.slice(0, 3).map((row) => ({
          traceId: row.sourceTraceId,
          spanId: row.sourceSpanId,
          name: row.name,
          sessionId: "",
          userId: "",
          operation: "chat",
          model: "",
          tags: [],
          startTime: row.startTime.toISOString(),
        })),
        warnings: rows.length > config.maxTraces ? ["Preview exceeds the trace ceiling"] : [],
      }
      return Effect.succeed(preview)
    },

    // Range-aware like a real source, so the engine's descending window walk is exercised
    // rather than being handed the whole fixture set on every call.
    fetchPage: (input) => {
      fetchPageCalls.push(input)
      if (options.failOn && fetchPageCalls.length === options.failOn.call) {
        return Effect.fail(options.failOn.error)
      }
      if (options.hang) return Effect.never
      const inWindow = rows.filter(
        (row) =>
          row.startTime.getTime() >= input.range.from.getTime() && row.startTime.getTime() < input.range.to.getTime(),
      )
      const page = input.cursor?.page ?? 0
      const start = page * input.limit
      const slice = inWindow.slice(start, start + input.limit)
      const hasMore = start + input.limit < inWindow.length
      return Effect.succeed({
        rows: slice,
        nextCursor: hasMore ? { page: page + 1 } : null,
        hasMore,
      })
    },

    normalize: (row, context: NormalizeContext, _config: ImportConfig): NormalizeResult => {
      if (skip.has(row.sourceSpanId)) return { status: "skip", reason: "fixture skip" }
      return {
        status: "ok",
        span: stubSpanDetail({
          organizationId: context.organizationId,
          projectId: context.projectId,
          traceId: fakeHexId(row.sourceTraceId, 32),
          spanId: fakeHexId(row.sourceSpanId, 16),
          parentSpanId: row.isRoot ? SpanId("") : fakeHexId(`${row.sourceTraceId}-root`, 16),
          name: row.name,
          startTime: row.startTime,
          ingestedAt: context.ingestedAt,
          retentionDays: context.retentionDays,
          ...(options.content?.input !== undefined
            ? { inputMessages: [{ role: "user", parts: [{ type: "text", content: options.content.input }] }] }
            : {}),
          ...(options.content?.output !== undefined
            ? { outputMessages: [{ role: "assistant", parts: [{ type: "text", content: options.content.output }] }] }
            : {}),
          metadata: {
            "import.job_id": context.importJobId,
            "import.source": context.source,
            "import.source_project_id": context.sourceProjectId,
            "import.source_trace_id": row.sourceTraceId,
            "import.source_span_id": row.sourceSpanId,
          },
        }),
      }
    },
  }

  return { adapter, fetchPageCalls }
}

/** Deterministic stand-in for the platform normalizer's hashing, so idempotency is assertable. */
const fakeHexId = <T extends string>(source: string, length: number): T => {
  let hex = ""
  for (const char of source) hex += char.charCodeAt(0).toString(16)
  return hex.padEnd(length, "0").slice(0, length) as T
}

export const createFakeImportAdapterRegistry = (
  options: FakeAdapterOptions = {},
): { registry: ImportSourceAdapterRegistry; fetchPageCalls: FetchPageInput<FakeCursor>[] } => {
  const { adapter, fetchPageCalls } = createFakeImportAdapter(options)
  return {
    registry: {
      langfuse: adapter,
      langsmith: { ...adapter, source: "langsmith" },
      braintrust: { ...adapter, source: "braintrust" },
    },
    fetchPageCalls,
  }
}
