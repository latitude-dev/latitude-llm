import { EvaluationRepository } from "@domain/evaluations"
import { type QueuePublishError, QueuePublisher } from "@domain/queue"
import { detectScriptCapabilities, hasLlmCapability } from "@domain/sandbox"
import { type ChSqlClient, OrganizationId, ProjectId, type RepositoryError, type SqlClient } from "@domain/shared"
import { type TraceListCursor, TraceRepository } from "@domain/spans"
import { Effect } from "effect"

// One page of historical traces per job; the worker re-enqueues itself with the page cursor until
// the window is exhausted, so a busy project's backfill never runs as one unbounded job.
const PAGE_SIZE = 200

export interface BackfillSignalScoresInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly evaluationId: string
  readonly windowStartIso: string
  /** Serialized `TraceListCursor` from the previous page; absent for the first page. */
  readonly cursor?: string
}

export interface BackfillSignalScoresResult {
  readonly publishedCount: number
  /** Serialized cursor for the next page, or null when the window is exhausted. */
  readonly nextCursor: string | null
  readonly done: boolean
}

/**
 * Backfills one page of a newly-created deterministic evaluation over the trace window
 * [windowStart, now]. Traces are walked newest-first (the default start_time-desc order); each
 * in-window, non-sandbox trace is fanned out to `live-evaluations:execute`, reusing the proven
 * execution path (idempotent per `(evaluation, trace)` via the canonical scores index). Stops at
 * the first trace older than the window. Judges are skipped — they collect forward.
 */
export const backfillSignalScoresUseCase = (input: BackfillSignalScoresInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    yield* Effect.annotateCurrentSpan("evaluationId", input.evaluationId)

    const evaluationRepo = yield* EvaluationRepository
    const traceRepo = yield* TraceRepository
    const publisher = yield* QueuePublisher

    const evaluation = yield* evaluationRepo
      .findById(input.evaluationId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    // Evaluation gone, archived, deleted, or an llm-judge → nothing to backfill.
    if (evaluation === null || evaluation.deletedAt !== null || evaluation.archivedAt !== null) {
      return { publishedCount: 0, nextCursor: null, done: true } satisfies BackfillSignalScoresResult
    }
    if (hasLlmCapability(detectScriptCapabilities(evaluation.script))) {
      return { publishedCount: 0, nextCursor: null, done: true } satisfies BackfillSignalScoresResult
    }

    const windowStart = new Date(input.windowStartIso)
    const cursor = input.cursor ? (JSON.parse(input.cursor) as TraceListCursor) : undefined

    const page = yield* traceRepo.listByProjectId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      options: { limit: PAGE_SIZE, sortBy: "startTime", sortDirection: "desc", ...(cursor ? { cursor } : {}) },
    })

    let publishedCount = 0
    let reachedWindowStart = false
    for (const trace of page.items) {
      if (trace.startTime < windowStart) {
        reachedWindowStart = true
        break
      }
      if (trace.simulationId !== "") continue // sandbox / simulation traces are excluded
      yield* publisher.publish("live-evaluations", "execute", {
        organizationId: input.organizationId,
        projectId: input.projectId,
        evaluationId: input.evaluationId,
        traceId: trace.traceId,
      })
      publishedCount += 1
    }

    const done = reachedWindowStart || !page.hasMore || page.nextCursor === undefined
    const nextCursor = done ? null : JSON.stringify(page.nextCursor)
    return { publishedCount, nextCursor, done } satisfies BackfillSignalScoresResult
  }).pipe(Effect.withSpan("signals.backfillSignalScores")) as Effect.Effect<
    BackfillSignalScoresResult,
    RepositoryError | QueuePublishError,
    EvaluationRepository | TraceRepository | QueuePublisher | SqlClient | ChSqlClient
  >
