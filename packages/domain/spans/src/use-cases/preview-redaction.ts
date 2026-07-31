import type { ChSqlClient, OrganizationId, ProjectId, RedactionPolicy, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { SpanDetail } from "../entities/span.ts"
import { SpanRepository } from "../ports/span-repository.ts"
import { redactSpanDetail } from "../redaction/redact-span.ts"
import type { RedactionCounts } from "../redaction/redact-text.ts"
import { compilePolicy } from "../redaction/rules.ts"

export interface RedactionPreviewSample {
  readonly traceId: string
  readonly spanId: string
  /** Which part of the span the excerpt came from, for example `inputMessages` or `attrString`. */
  readonly field: string
  readonly before: string
  readonly after: string
}

export interface RedactionPreviewResult {
  readonly spansSampled: number
  readonly spansAffected: number
  readonly countsByLabel: RedactionCounts
  readonly samples: readonly RedactionPreviewSample[]
}

export interface PreviewRedactionInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly policy: RedactionPolicy
  readonly sampleSize: number
  readonly maxSamples?: number
}

const DEFAULT_MAX_SAMPLES = 20

/** Enough to recognise the value in context without turning the panel into a transcript. */
const EXCERPT_CONTEXT_CHARS = 60

/**
 * Answers "what would this policy do to my data" against spans already stored.
 *
 * Read-only, and deliberately so: it re-reads `spans` and re-runs redaction for display. Nothing
 * is written back. That matters beyond the obvious, because `toInsertRow` defaults
 * `retention_days` to 90 while the detail read never selects it, so a read-redact-reinsert round
 * trip would silently reset retention on every span it touched.
 */
export const previewRedactionUseCase = (
  input: PreviewRedactionInput,
): Effect.Effect<RedactionPreviewResult, RepositoryError, SpanRepository | ChSqlClient> =>
  Effect.gen(function* () {
    const repo = yield* SpanRepository
    const spans = yield* repo.listRecentDetailsByProjectId({
      organizationId: input.organizationId,
      projectId: input.projectId,
      limit: input.sampleSize,
    })

    const compiled = compilePolicy(input.policy)
    const counts: RedactionCounts = {}
    const samples: RedactionPreviewSample[] = []
    const maxSamples = input.maxSamples ?? DEFAULT_MAX_SAMPLES
    let spansAffected = 0

    for (const span of spans) {
      const result = redactSpanDetail(span, compiled, new Map())
      const changed = changedFields(span, result.span)
      if (changed.length === 0) continue

      spansAffected += 1
      for (const [label, count] of Object.entries(result.stats.counts)) {
        counts[label] = (counts[label] ?? 0) + count
      }

      for (const field of changed) {
        if (samples.length >= maxSamples) break
        samples.push({
          traceId: span.traceId,
          spanId: span.spanId,
          field,
          ...excerpt(serialize(span, field), serialize(result.span, field)),
        })
      }
    }

    yield* Effect.annotateCurrentSpan("preview.spansSampled", spans.length)
    yield* Effect.annotateCurrentSpan("preview.spansAffected", spansAffected)

    return { spansSampled: spans.length, spansAffected, countsByLabel: counts, samples }
  }).pipe(Effect.withSpan("spans.previewRedaction"))

/** Every field redaction can touch, so a preview cannot quietly omit one the engine changes. */
const PREVIEWED_FIELDS = [
  "inputMessages",
  "outputMessages",
  "systemInstructions",
  "toolDefinitions",
  "toolInput",
  "toolOutput",
  "eventsJson",
  "statusMessage",
  "attrString",
  "resourceString",
  "metadata",
  "tags",
  "userId",
  "userEmail",
] as const

const serialize = (span: SpanDetail, field: string): string => {
  const value = (span as unknown as Record<string, unknown>)[field]

  return typeof value === "string" ? value : JSON.stringify(value)
}

const changedFields = (before: SpanDetail, after: SpanDetail): string[] =>
  PREVIEWED_FIELDS.filter((field) => serialize(before, field) !== serialize(after, field))

/**
 * Trims both sides to the region around the first difference.
 *
 * Anchoring on the first differing character rather than the start of the field is what keeps a
 * multi-kilobyte tool output readable: the change is usually nowhere near the beginning.
 */
function excerpt(before: string, after: string): { before: string; after: string } {
  let at = 0
  while (at < before.length && at < after.length && before[at] === after[at]) at += 1

  const from = Math.max(0, at - EXCERPT_CONTEXT_CHARS)
  const window = EXCERPT_CONTEXT_CHARS * 3

  return { before: clip(before, from, window), after: clip(after, from, window) }
}

const clip = (value: string, from: number, length: number): string => {
  const head = from > 0 ? "…" : ""
  const slice = value.slice(from, from + length)
  const tail = from + length < value.length ? "…" : ""

  return `${head}${slice}${tail}`
}
