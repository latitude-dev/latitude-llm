import type { EffectivePlanResolution } from "@domain/billing"
import type { DomainEvent, EventsPublisher } from "@domain/events"
import { ImportJobId, OrganizationId, ProjectId, type RedactionPolicy } from "@domain/shared"
import { redactSpans, type SpanDetail, SpanRepository } from "@domain/spans"
import { Effect, Result } from "effect"
import {
  IMPORT_CLICKHOUSE_CHUNK_SIZE,
  IMPORT_MAX_RATE_LIMIT_WAITS,
  IMPORT_MAX_RETRY_AFTER_MS,
  IMPORT_PAGE_TIMEOUT_MS,
  IMPORT_WINDOW_BASE_MS,
  IMPORT_WINDOW_GROWTH_FACTOR,
  IMPORT_WINDOW_MAX_MS,
  sourceRequestIntervalMs,
} from "../constants.ts"
import type { ImportJob } from "../entities/import-job.ts"
import { appendImportRun, type ImportRun } from "../entities/import-run.ts"
import type { ImportCursor, ImportSourceCursor } from "../entities/import-source.ts"
import { ImportSourceError, sanitizedImportError } from "../errors.ts"
import { ImportJobRepository } from "../ports/import-job-repository.ts"
import { getAdapter, ImportSourceAdapters } from "../ports/import-source-adapter.ts"
import { finishImport } from "./finish-import.ts"
import { importUsageAvailable } from "./import-usage-available.ts"

export interface ProcessImportPageInput {
  readonly organizationId: string
  readonly projectId: string
  readonly importJobId: string
  /** Resolved per page so retention, billing context and the usage ceiling stay current. */
  readonly plan: EffectivePlanResolution
  /** Sandbox orgs are never billed, so their imports skip the usage gate and the LLM fan-out. */
  readonly isSandbox: boolean
  /**
   * The target project's resolved redaction policy, or `null` to redact nothing. Read per
   * page rather than snapshotted, so turning redaction on lands on the next page.
   */
  readonly redactionPolicy: RedactionPolicy | null
  /** Absent degrades pseudonymized identities to full redaction rather than blocking the import. */
  readonly pseudonymSecret?: string
  /** Consecutive `Retry-After` waits already spent on this page, carried in the queue payload. */
  readonly rateLimitWaits?: number
}

export interface ProcessImportPageDeps<TPublishError = unknown> {
  readonly publishNextPage: (
    input: {
      readonly organizationId: string
      readonly projectId: string
      readonly importJobId: string
      readonly rateLimitWaits?: number
    },
    options?: { readonly delayMs: number },
  ) => Effect.Effect<void, unknown>
  /**
   * Imported spans go through the same `TracesIngested` event as live ingestion, so
   * conversation intelligence, embeddings, search indexing and billing all run on them.
   */
  readonly eventsPublisher: EventsPublisher<TPublishError>
  /** Overridable so tests can exercise the timeout without waiting out the real budget. */
  readonly pageTimeoutMs?: number
}

export interface RecordImportFinalFailureInput {
  readonly organizationId: string
  readonly projectId: string
  readonly importJobId: string
  readonly error: Error
  readonly now: Date
}

export type ProcessImportPageResult =
  | {
      readonly done: true
      readonly reason: "not_found" | "mismatch" | "terminal" | "cancelled" | "failed" | "capped" | "succeeded"
    }
  | { readonly done: false; readonly reason: "next_page" | "rate_limited" }

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

const isTerminal = (status: string): boolean =>
  status === "succeeded" || status === "capped" || status === "cancelled" || status === "failed"

const finalFailureMessage = (error: Error): string => {
  if (error instanceof ImportSourceError) return sanitizedImportError(error)
  return "Import retries exhausted"
}

/**
 * Why the plan stopped the import. Written to `error`, which is the field the UI and the
 * `ImportFinished` funnel already read for "why did this not finish cleanly"; `status`
 * is what distinguishes a cap from a failure.
 */
const PLAN_CAP_REASON =
  "Ran out of plan usage for this billing period. Imported traces are billed like ingested ones, so the rest of the range needs more usage, or another import once the period resets." as const

/**
 * Said out loud rather than reported as a clean success.
 *
 * An empty page is indistinguishable from an empty time window to the walk, and the fail-loud
 * missing-cursor guard only fires on a *full* page, so a source that answers every request with
 * no rows produced a green tick and zero traces. That happened for real: Langfuse's v2 endpoint
 * lagged behind its own ingestion and returned `{"data":[],"meta":{}}` with HTTP 200 for eleven
 * minutes while the data sat there, readable on v1 the whole time.
 */
const EMPTY_RANGE_NOTE =
  "No traces were found anywhere in this range. Nothing was imported. If the source does hold traces here, its API may not have made them readable yet — check the range and try again."

const initialCursor = (job: ImportJob): ImportCursor => ({
  windowEnd: job.config.rangeTo,
  windowMs: IMPORT_WINDOW_BASE_MS,
  source: null,
})

/** The window's lower bound, clamped so the walk never reads below the configured range. */
const windowStartOf = (cursor: ImportCursor, rangeFrom: Date): Date =>
  new Date(Math.max(rangeFrom.getTime(), cursor.windowEnd.getTime() - cursor.windowMs))

/**
 * Step to the next older window. A window that came back empty on its first page has
 * nothing in it, so the next one widens — that is what keeps a sparse year from costing
 * one request per day. Any rows at all reset to the base width, which is the granularity
 * a capped import truncates at.
 */
const advanceWindow = (cursor: ImportCursor, windowStart: Date, wasEmpty: boolean): ImportCursor => ({
  windowEnd: windowStart,
  windowMs: wasEmpty
    ? Math.min(cursor.windowMs * IMPORT_WINDOW_GROWTH_FACTOR, IMPORT_WINDOW_MAX_MS)
    : IMPORT_WINDOW_BASE_MS,
  source: null,
})

interface AdmittedSpans {
  readonly spans: readonly SpanDetail[]
  /** Roots admitted, which is the number of traces this page contributes to the budget. */
  readonly traces: number
  /**
   * Distinct sessions among the admitted roots, counting a sessionless root as its own session
   * — the same identity the session rollup uses. Per-page distinct, so the job-level sum counts
   * a session once per page its traces land in.
   */
  readonly sessions: number
  readonly truncated: boolean
}

/**
 * Fills the remaining trace budget from a page, newest trace first and whole traces only.
 *
 * Two things make this necessary rather than admitting rows in the order they arrived.
 *
 * Ordering: only LangSmith sorts inside a window. Langfuse has no sort parameter at all — the
 * reason ordering lives in the engine — so a page arrives in whatever order the source chose.
 * Truncating that stream keeps an arbitrary subset, and windows widen up to 32 days over sparse
 * history, so "newest first" could otherwise mean "some traces from a month-wide window".
 * Sorting by the root's start time makes the truncation exact whatever the source did.
 *
 * Whole traces: cutting the stream mid-page also orphaned spans whose own root had already been
 * admitted, leaving a trace half-imported with no record that anything was dropped. A trace is
 * admitted with all of its spans or none of them.
 *
 * Spans whose root is not in this page cost no budget: their root was counted in an earlier page
 * of the same window, and dropping them would strand the trace that root already paid for.
 */
const admitNewestTraces = (spans: readonly SpanDetail[], remainingTraces: number): AdmittedSpans => {
  const byTrace = new Map<string, SpanDetail[]>()
  for (const span of spans) {
    const traceId = span.traceId as string
    const existing = byTrace.get(traceId)
    if (existing) existing.push(span)
    else byTrace.set(traceId, [span])
  }

  const rooted: { readonly root: SpanDetail; readonly spans: readonly SpanDetail[] }[] = []
  const orphans: SpanDetail[] = []
  for (const group of byTrace.values()) {
    const root = group.find((span) => span.parentSpanId === "")
    if (root) rooted.push({ root, spans: group })
    else orphans.push(...group)
  }

  rooted.sort((left, right) => right.root.startTime.getTime() - left.root.startTime.getTime())

  const admitted: SpanDetail[] = [...orphans]
  const sessionKeys = new Set<string>()
  let traces = 0
  let truncated = false
  for (const group of rooted) {
    if (traces >= remainingTraces) {
      truncated = true
      break
    }
    admitted.push(...group.spans)
    traces++
    const sessionId = group.root.sessionId as string
    sessionKeys.add(sessionId === "" ? `trace:${group.root.traceId}` : sessionId)
  }

  return { spans: admitted, traces, sessions: sessionKeys.size, truncated }
}

export const recordImportFinalFailureUseCase = (input: RecordImportFinalFailureInput) =>
  Effect.gen(function* () {
    const jobs = yield* ImportJobRepository
    const job = yield* jobs.findById(ImportJobId(input.importJobId))

    if (!job) return { recorded: false as const, reason: "not_found" as const }
    if (job.organizationId !== input.organizationId || job.projectId !== input.projectId) {
      return { recorded: false as const, reason: "mismatch" as const }
    }
    if (isTerminal(job.status)) return { recorded: false as const, reason: "terminal" as const }

    const recorded = yield* jobs.markFailedIfActive(job.id, {
      error: finalFailureMessage(input.error),
      finishedAt: input.now,
    })

    return recorded ? { recorded: true as const } : { recorded: false as const, reason: "terminal" as const }
  }).pipe(Effect.withSpan("imports.recordFinalFailure"))

export const processImportPageUseCase =
  <TPublishError>({
    publishNextPage,
    eventsPublisher,
    pageTimeoutMs = IMPORT_PAGE_TIMEOUT_MS,
  }: ProcessImportPageDeps<TPublishError>) =>
  (input: ProcessImportPageInput) =>
    Effect.gen(function* () {
      const jobs = yield* ImportJobRepository
      const adapters = yield* ImportSourceAdapters
      const spanRepo = yield* SpanRepository

      const job = yield* jobs.findById(ImportJobId(input.importJobId))
      if (!job) return { done: true as const, reason: "not_found" as const }

      if (job.organizationId !== input.organizationId || job.projectId !== input.projectId) {
        return { done: true as const, reason: "mismatch" as const }
      }

      if (isTerminal(job.status)) return { done: true as const, reason: "terminal" as const }

      if (job.cancelledAt) {
        yield* finishImport(job, "cancelled")
        return { done: true as const, reason: "cancelled" as const }
      }

      if (!job.credentials) {
        yield* finishImport(job, "failed", { error: "Missing credentials" })
        return { done: true as const, reason: "failed" as const }
      }

      const stats = { ...job.stats }
      if (stats.tracesImported >= job.config.maxTraces) {
        yield* finishImport(job, "succeeded", { stats })
        return { done: true as const, reason: "succeeded" as const }
      }

      // Read fresh each page rather than trusting the snapshot, so live ingestion or a
      // spending-limit change during a long import stops it too. The snapshot in
      // `config.maxTraces` is the user's own ceiling; this is the plan's.
      if (!input.isSandbox && !(yield* importUsageAvailable(input.plan))) {
        yield* finishImport(job, "capped", { error: PLAN_CAP_REASON })
        return { done: true as const, reason: "capped" as const }
      }

      const cursor = job.cursor ?? initialCursor(job)
      const windowStart = windowStartOf(cursor, job.config.rangeFrom)
      if (cursor.windowEnd.getTime() <= job.config.rangeFrom.getTime()) {
        yield* finishImport(job, "succeeded", { stats })
        return { done: true as const, reason: "succeeded" as const }
      }

      const adapter = getAdapter(adapters, job.source)
      const pageStartedAt = new Date()
      const rateLimitWaits = input.rateLimitWaits ?? 0

      yield* Effect.annotateCurrentSpan("import.windowEnd", cursor.windowEnd.toISOString())
      yield* Effect.annotateCurrentSpan("import.windowStart", windowStart.toISOString())

      const pageResult = yield* adapter
        .fetchPage({
          credentials: job.credentials,
          sourceProjectId: job.config.sourceProjectId,
          config: job.config,
          cursor: cursor.source,
          range: { from: windowStart, to: cursor.windowEnd },
          limit: job.config.sourcePageSize,
        })
        .pipe(
          Effect.timeout(`${pageTimeoutMs} millis`),
          Effect.catchTag("TimeoutError", () =>
            Effect.fail(
              new ImportSourceError({
                category: "transport",
                message: `Source page timed out after ${pageTimeoutMs}ms`,
                retryable: true,
              }),
            ),
          ),
          Effect.result,
        )

      if (Result.isFailure(pageResult)) {
        const failure = pageResult.failure
        const importError =
          failure instanceof ImportSourceError
            ? failure
            : new ImportSourceError({
                category: "mapping",
                message: "Import page failed",
                retryable: false,
              })
        const failedRun: ImportRun = {
          status: "failed",
          // The page never advanced, so both ends are the cursor it was attempting.
          cursor: { start: cursor, end: cursor },
          stats: { recordsFetched: 0, sessionsImported: 0, tracesImported: 0, spansImported: 0, spansSkipped: 0 },
          error: sanitizedImportError(importError),
          startedAt: pageStartedAt,
          finishedAt: new Date(),
        }
        const runsAfterFailure = appendImportRun(job.runs, failedRun)

        // A source that told us how long to wait gets that wait honoured exactly,
        // via a deferred re-publish of this same page rather than BullMQ's blind
        // exponential backoff. Bounded so a permanent throttle still terminates.
        const retryAfterMs = importError.retryAfterMs
        if (importError.category === "rate_limited" && retryAfterMs !== undefined) {
          if (rateLimitWaits < IMPORT_MAX_RATE_LIMIT_WAITS) {
            yield* jobs.updateStatus(job.id, job.status, { runs: runsAfterFailure })
            yield* publishNextPage(
              {
                organizationId: job.organizationId,
                projectId: job.projectId,
                importJobId: job.id,
                rateLimitWaits: rateLimitWaits + 1,
              },
              { delayMs: Math.min(retryAfterMs, IMPORT_MAX_RETRY_AFTER_MS) },
            )
            return { done: false as const, reason: "rate_limited" as const }
          }
          yield* finishImport(job, "failed", {
            runs: runsAfterFailure,
            error: `${sanitizedImportError(importError)} (gave up after ${IMPORT_MAX_RATE_LIMIT_WAITS} Retry-After waits)`,
          })
          return { done: true as const, reason: "failed" as const }
        }

        if (importError.retryable) {
          yield* jobs.updateStatus(job.id, job.status, { runs: runsAfterFailure })
          return yield* Effect.fail(importError)
        }
        yield* finishImport(job, "failed", {
          runs: runsAfterFailure,
          error: sanitizedImportError(importError),
        })
        return { done: true as const, reason: "failed" as const }
      }

      const page = pageResult.success

      stats.recordsFetched += page.rows.length

      const ingestedAt = new Date()
      const normalized: SpanDetail[] = []
      let skipped = 0

      for (const row of page.rows) {
        const result = adapter.normalize(
          row,
          {
            organizationId: job.organizationId,
            projectId: job.projectId,
            importJobId: job.id,
            source: job.source,
            sourceProjectId: job.config.sourceProjectId,
            ingestedAt,
            retentionDays: input.plan.plan.retentionDays,
          },
          job.config,
        )

        if (result.status === "skip") {
          skipped++
          continue
        }
        normalized.push(result.span)
      }

      const admitted = admitNewestTraces(normalized, job.config.maxTraces - stats.tracesImported)
      const spans = admitted.spans
      const rootsInPage = admitted.traces
      const truncatedByCap = admitted.truncated

      // An import is a second content sink into `spans`, so it runs the same redaction the
      // ingest pipeline runs — before the insert, which is the only point where stripping
      // content still means anything. Fails closed: a `RedactionError` propagates, the page
      // retries, and nothing a project asked us to strip reaches ClickHouse.
      const redaction = yield* redactSpans({
        spans,
        organizationId: OrganizationId(job.organizationId),
        policyByProjectId: input.redactionPolicy
          ? new Map([[job.projectId as string, input.redactionPolicy]])
          : new Map(),
        pseudonymSecret: input.pseudonymSecret,
      })
      if (redaction.summary.redactedSpans > 0) {
        yield* Effect.annotateCurrentSpan("redaction.spans", redaction.summary.redactedSpans)
      }

      const importedSpans = redaction.spans
      for (const batch of chunk(importedSpans, IMPORT_CLICKHOUSE_CHUNK_SIZE)) {
        if (batch.length > 0) yield* spanRepo.insert(batch)
      }

      const traceIds = new Set(importedSpans.map((span) => span.traceId as string))

      stats.sessionsImported += admitted.sessions
      stats.tracesImported += rootsInPage
      stats.spansImported += importedSpans.length
      stats.spansSkipped += skipped

      if (traceIds.size > 0) {
        yield* eventsPublisher.publish({
          name: "TracesIngested",
          organizationId: job.organizationId,
          payload: {
            organizationId: job.organizationId,
            projectId: ProjectId(job.projectId),
            traceIds: [...traceIds],
            isSandbox: input.isSandbox,
            billing: {
              planSlug: input.plan.plan.slug,
              planSource: input.plan.source,
              periodStart: input.plan.periodStart.toISOString(),
              periodEnd: input.plan.periodEnd.toISOString(),
              includedCredits: input.plan.plan.includedCredits,
              overageAllowed: input.plan.plan.overageAllowed,
            },
          },
        } satisfies DomainEvent)
      }

      const windowWasEmpty = page.rows.length === 0 && cursor.source === null
      const windowDone = !page.hasMore
      const nextCursor: ImportCursor = windowDone
        ? advanceWindow(cursor, windowStart, windowWasEmpty)
        : {
            windowEnd: cursor.windowEnd,
            windowMs: cursor.windowMs,
            source: page.nextCursor as ImportSourceCursor | null,
          }
      const rangeDone = windowDone && windowStart.getTime() <= job.config.rangeFrom.getTime()

      const runs = appendImportRun(job.runs, {
        status: "succeeded",
        cursor: { start: cursor, end: nextCursor },
        stats: {
          recordsFetched: page.rows.length,
          sessionsImported: admitted.sessions,
          tracesImported: rootsInPage,
          spansImported: importedSpans.length,
          spansSkipped: skipped,
        },
        error: null,
        startedAt: pageStartedAt,
        finishedAt: new Date(),
      })

      // Importing every trace the user asked for is what success means, so their own `maxTraces`
      // ends the job cleanly even with range left over — the preview already told them the oldest
      // traces would be left behind. `capped` is reserved for the plan's ceiling, which is the one
      // the user did not choose and can resume from once usage frees up.
      if (truncatedByCap || stats.tracesImported >= job.config.maxTraces) {
        yield* finishImport(job, "succeeded", { cursor: nextCursor, stats, runs })
        return { done: true as const, reason: "succeeded" as const }
      }

      if (rangeDone) {
        yield* finishImport(job, "succeeded", {
          cursor: nextCursor,
          stats,
          runs,
          ...(stats.recordsFetched === 0 ? { error: EMPTY_RANGE_NOTE } : {}),
        })
        return { done: true as const, reason: "succeeded" as const }
      }

      yield* jobs.updateStatus(job.id, "running", { cursor: nextCursor, stats, runs })

      yield* publishNextPage(
        {
          organizationId: job.organizationId,
          projectId: job.projectId,
          importJobId: job.id,
        },
        { delayMs: sourceRequestIntervalMs(job.source) },
      )

      return { done: false as const, reason: "next_page" as const }
    }).pipe(Effect.withSpan("imports.processPage"))
