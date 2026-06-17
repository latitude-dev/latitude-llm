import { ALIGNMENT_METRIC_RECOMPUTE_THROTTLE_MS, EvaluationRepository, isActiveEvaluation } from "@domain/evaluations"
import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import { generateSlug, SignalId, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SignalRepository } from "../ports/issue-repository.ts"
import { type GenerateSignalDetailsError, generateSignalDetailsUseCase } from "./generate-issue-details.ts"

export interface RefreshSignalDetailsInput {
  readonly organizationId: string
  readonly signalId: string
  readonly projectId: string
}

export type RefreshSignalDetailsResult =
  | {
      readonly action: "not-found"
      readonly signalId: string
    }
  | {
      readonly action: "unchanged"
      readonly signalId: string
    }
  | {
      readonly action: "updated"
      readonly signalId: string
    }

export type RefreshSignalDetailsError = RepositoryError | GenerateSignalDetailsError | QueuePublishError

const enqueueLinkedEvaluationAlignments = (input: RefreshSignalDetailsInput) =>
  Effect.gen(function* () {
    const evaluationRepository = yield* EvaluationRepository
    const queuePublisher = yield* QueuePublisher
    const evaluations = yield* evaluationRepository.listBySignalId({
      projectId: ProjectId(input.projectId),
      signalId: SignalId(input.signalId),
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
            signalId: input.signalId,
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

export const refreshSignalDetailsUseCase = (input: RefreshSignalDetailsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const generatedDetailsResult = yield* generateSignalDetailsUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      signalId: input.signalId,
    }).pipe(
      Effect.map((details) => ({ action: "ready", details }) as const),
      Effect.catchTag("SignalNotFoundForDetailsGenerationError", () => Effect.succeed({ action: "not-found" } as const)),
    )

    if (generatedDetailsResult.action === "not-found") {
      return {
        action: "not-found",
        signalId: input.signalId,
      } satisfies RefreshSignalDetailsResult
    }

    const sqlClient = yield* SqlClient

    const result = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const lockedSignalResult = yield* signalRepository.findByIdForUpdate(SignalId(input.signalId)).pipe(
          Effect.map((issue) => ({ action: "found", issue }) as const),
          Effect.catchTag("NotFoundError", () => Effect.succeed({ action: "not-found" } as const)),
        )

        if (lockedSignalResult.action === "not-found") {
          return {
            action: "not-found",
            signalId: input.signalId,
          } satisfies RefreshSignalDetailsResult
        }

        const issue = lockedSignalResult.issue

        if (
          issue.name === generatedDetailsResult.details.name &&
          issue.description === generatedDetailsResult.details.description
        ) {
          return {
            action: "unchanged",
            signalId: issue.id,
          } satisfies RefreshSignalDetailsResult
        }

        // Slug regenerates only when the name actually changed; description-only refreshes keep the slug.
        const slug =
          issue.name === generatedDetailsResult.details.name
            ? issue.slug
            : yield* generateSlug({
                name: generatedDetailsResult.details.name,
                count: (slug) =>
                  signalRepository.countBySlug({
                    projectId: ProjectId(issue.projectId),
                    slug,
                    excludeSignalId: issue.id,
                  }),
              })

        yield* signalRepository.save({
          ...issue,
          slug,
          name: generatedDetailsResult.details.name,
          description: generatedDetailsResult.details.description,
          updatedAt: new Date(),
        })

        return {
          action: "updated",
          signalId: issue.id,
        } satisfies RefreshSignalDetailsResult
      }),
    )

    if (result.action !== "not-found") {
      yield* enqueueLinkedEvaluationAlignments(input)
    }

    return result
  }).pipe(Effect.withSpan("issues.refreshSignalDetails")) as Effect.Effect<
    RefreshSignalDetailsResult,
    RefreshSignalDetailsError
  >
