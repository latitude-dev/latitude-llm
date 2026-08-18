import { writePublishedAnnotationUseCase } from "@domain/annotations"
import { ProjectRepository } from "@domain/projects"
import { ScoreRepository } from "@domain/scores"
import { LATITUDE_TELEMETRY_PROJECT_SLUGS, OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"

/**
 * One customer verdict applied to one flagger generation.
 *
 * `organizationId` is the dogfood organization the flagger's own telemetry was
 * exported to, resolved by the caller from the telemetry credential — never from
 * a request or a payload. Every repository here runs under a scope pinned to it,
 * which is why the caller composes the scope and this use case does not.
 */
export interface RecordSignalFlaggerReviewInput {
  readonly organizationId: string
  readonly signalId: string
  readonly flaggerSlug: string
  readonly flaggerTraceId: string
  readonly value: number
  readonly passed: boolean
  readonly feedback: string
}

export type RecordSignalFlaggerReviewResult =
  | { readonly action: "skipped"; readonly reason: "project-not-found" | "trace-not-in-project" | "already-reviewed" }
  | { readonly action: "written"; readonly scoreId: string }

const CONFIRMED_FEEDBACK = "Confirmed as a real problem"

/**
 * Grades the flagger generation behind a detection with the customer's verdict on
 * the signal it produced, as a published annotation in the `latitude-flaggers`
 * dogfood project. The customer's own project is never written to.
 */
export const recordSignalFlaggerReviewUseCase = Effect.fn("productFeedback.recordSignalFlaggerReview")(function* (
  input: RecordSignalFlaggerReviewInput,
) {
  yield* Effect.annotateCurrentSpan("productFeedback.flow", "signal-flagger-review")
  yield* Effect.annotateCurrentSpan("productFeedback.signalId", input.signalId)
  yield* Effect.annotateCurrentSpan("productFeedback.flaggerSlug", input.flaggerSlug)

  const organizationId = OrganizationId(input.organizationId)
  const traceId = TraceId(input.flaggerTraceId)
  const feedback = input.feedback.trim() || (input.passed ? CONFIRMED_FEEDBACK : "")

  const projectRepository = yield* ProjectRepository
  const project = yield* projectRepository
    .findBySlug(LATITUDE_TELEMETRY_PROJECT_SLUGS.flaggers)
    .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
  if (project === null) {
    return { action: "skipped", reason: "project-not-found" } as const
  }

  const projectId = ProjectId(project.id)
  const traceRepository = yield* TraceRepository
  const belongsToProject = yield* traceRepository.matchesFiltersByTraceId({ organizationId, projectId, traceId })
  if (!belongsToProject) {
    return { action: "skipped", reason: "trace-not-in-project" } as const
  }

  // One indexed read makes a mid-job retry idempotent: the write itself has no
  // natural key to dedup on, and a signal is graded once, so a matching row can
  // only be this job's own earlier attempt.
  const scoreRepository = yield* ScoreRepository
  const existing = yield* scoreRepository.listByTraceId({ projectId, traceId, source: "annotation" })
  const alreadyReviewed = existing.items.some(
    (score) => score.sourceId === "API" && score.passed === input.passed && score.feedback === feedback,
  )
  if (alreadyReviewed) {
    return { action: "skipped", reason: "already-reviewed" } as const
  }

  const written = yield* writePublishedAnnotationUseCase({
    organizationId,
    projectId,
    // Deliberately not `SYSTEM`: that sentinel marks flagger-authored rows and is
    // load-bearing for flagger anchor dedup, which also runs inside
    // `latitude-flaggers`. This row is a human verdict.
    sourceId: "API",
    traceId,
    sessionId: null,
    spanId: null,
    simulationId: null,
    signalId: null,
    // The human belongs to another tenant, so their id would dangle here.
    annotatorId: null,
    value: input.value,
    passed: input.passed,
    feedback,
  })

  return { action: "written", scoreId: written.id } as const
})
