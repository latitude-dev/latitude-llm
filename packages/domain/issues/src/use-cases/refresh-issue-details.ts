import { ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS, EvaluationRepository, isActiveEvaluation } from "@domain/evaluations"
import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import { IssueId, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { IssueRepository } from "../ports/issue-repository.ts"
import { type GenerateIssueDetailsError, generateIssueDetailsUseCase } from "./generate-issue-details.ts"
import { syncIssueProjectionsUseCase } from "./sync-projections.ts"

export interface RefreshIssueDetailsInput {
  readonly organizationId: string
  readonly issueId: string
  readonly projectId: string
}

export type RefreshIssueDetailsResult =
  | {
      readonly action: "not-found"
      readonly issueId: string
    }
  | {
      readonly action: "unchanged"
      readonly issueId: string
    }
  | {
      readonly action: "updated"
      readonly issueId: string
    }

export type RefreshIssueDetailsError = RepositoryError | GenerateIssueDetailsError | QueuePublishError

const enqueueLinkedEvaluationAlignments = (input: RefreshIssueDetailsInput) =>
  Effect.gen(function* () {
    const evaluationRepository = yield* EvaluationRepository
    const queuePublisher = yield* QueuePublisher
    const evaluations = yield* evaluationRepository.listByIssueId({
      projectId: ProjectId(input.projectId),
      issueId: IssueId(input.issueId),
      options: { lifecycle: "active" },
    })

    // Publish the throttled 1h metric-refresh task per active linked
    // evaluation. BullMQ owns the timing via `dedupeKey` + `throttleMs`: the
    // first publish schedules the workflow for `now + 1h`, and subsequent
    // publishes within that hour are dropped so a constant annotation stream
    // cannot starve the refresh. The consumer starts
    // `refreshEvaluationAlignmentWorkflow` when the window elapses. If the
    // incremental evaluator escalates to a full re-optimization the workflow
    // itself publishes `evaluations:automaticOptimization` with the 8h
    // throttle — this use case never schedules optimization directly.
    yield* Effect.forEach(
      evaluations.items.filter(isActiveEvaluation),
      (evaluation) =>
        queuePublisher.publish(
          "evaluations",
          "automaticRefreshAlignment",
          {
            organizationId: input.organizationId,
            projectId: input.projectId,
            issueId: input.issueId,
            evaluationId: evaluation.id,
          },
          {
            dedupeKey: `evaluations:refreshAlignment:${evaluation.id}`,
            throttleMs: ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS,
          },
        ),
      { concurrency: "unbounded" },
    )
  })

export const refreshIssueDetailsUseCase = (input: RefreshIssueDetailsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("issueId", input.issueId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const generatedDetailsResult = yield* generateIssueDetailsUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
    }).pipe(
      Effect.map((details) => ({ action: "ready", details }) as const),
      Effect.catchTag("IssueNotFoundForDetailsGenerationError", () => Effect.succeed({ action: "not-found" } as const)),
    )

    if (generatedDetailsResult.action === "not-found") {
      return {
        action: "not-found",
        issueId: input.issueId,
      } satisfies RefreshIssueDetailsResult
    }

    const sqlClient = yield* SqlClient

    const result = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const lockedIssueResult = yield* issueRepository.findByIdForUpdate(IssueId(input.issueId)).pipe(
          Effect.map((issue) => ({ action: "found", issue }) as const),
          Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" } as const)),
        )

        if (lockedIssueResult.action === "not-found") {
          return {
            action: "not-found",
            issueId: input.issueId,
          } satisfies RefreshIssueDetailsResult
        }

        const issue = lockedIssueResult.issue

        if (
          issue.name === generatedDetailsResult.details.name &&
          issue.description === generatedDetailsResult.details.description
        ) {
          return {
            action: "unchanged",
            issueId: issue.id,
          } satisfies RefreshIssueDetailsResult
        }

        yield* issueRepository.save({
          ...issue,
          name: generatedDetailsResult.details.name,
          description: generatedDetailsResult.details.description,
          updatedAt: new Date(),
        })

        return {
          action: "updated",
          issueId: issue.id,
        } satisfies RefreshIssueDetailsResult
      }),
    )

    if (result.action === "updated") {
      yield* syncIssueProjectionsUseCase({
        organizationId: input.organizationId,
        issueId: result.issueId,
      })
    }

    if (result.action !== "not-found") {
      yield* enqueueLinkedEvaluationAlignments(input)
    }

    return result
  }).pipe(Effect.withSpan("issues.refreshIssueDetails")) as Effect.Effect<
    RefreshIssueDetailsResult,
    RefreshIssueDetailsError
  >
