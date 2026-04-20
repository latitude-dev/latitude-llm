import { OutboxEventWriter } from "@domain/events"
import { type Score, ScoreRepository } from "@domain/scores"
import { IssueId, type RepositoryError, ScoreId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Issue } from "../entities/issue.ts"
import type { CheckEligibilityError } from "../errors.ts"
import { IssueNotFoundForAssignmentError, ScoreAlreadyOwnedByIssueError } from "../errors.ts"
import { updateIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"

export interface AssignScoreToIssueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly issueId: string
  readonly normalizedEmbedding: readonly number[]
}

export type AssignScoreToIssueResult = {
  readonly issueId: string
  readonly action: "assigned-existing" | "already-assigned"
}

export type AssignScoreToIssueError =
  | CheckEligibilityError
  | IssueNotFoundForAssignmentError
  | RepositoryError
  | ScoreAlreadyOwnedByIssueError

type LoadedEligibleScoreResult =
  | {
      readonly action: "ready"
      readonly score: Score
    }
  | {
      readonly action: "already-assigned"
      readonly issueId: string
    }

const loadEligibleScoreOrCurrentOwner = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}) =>
  checkEligibilityUseCase(input).pipe(
    Effect.map((score) => ({ action: "ready", score }) satisfies LoadedEligibleScoreResult),
    Effect.catchTag("ScoreAlreadyOwnedByIssueError", () =>
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        const currentScore = yield* scoreRepository
          .findById(ScoreId(input.scoreId))
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        const existingIssueId = currentScore?.issueId

        if (existingIssueId != null) {
          return {
            action: "already-assigned",
            issueId: existingIssueId,
          } satisfies LoadedEligibleScoreResult
        }

        return yield* new ScoreAlreadyOwnedByIssueError({ scoreId: input.scoreId })
      }),
    ),
  )

const buildIssueWithAssignedScore = ({
  issue,
  score,
  normalizedEmbedding,
  assignedAt,
}: {
  readonly issue: Issue
  readonly score: Score
  readonly normalizedEmbedding: readonly number[]
  readonly assignedAt: Date
}): Issue => {
  const centroid = updateIssueCentroid({
    centroid: {
      ...issue.centroid,
      clusteredAt: issue.clusteredAt,
    },
    score: {
      embedding: normalizedEmbedding,
      source: score.source,
      createdAt: score.createdAt,
    },
    operation: "add",
    timestamp: assignedAt,
  })

  return {
    ...issue,
    centroid,
    clusteredAt: centroid.clusteredAt,
    updatedAt: assignedAt,
  }
}

export const assignScoreToIssueUseCase = (input: AssignScoreToIssueInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("issueId", input.issueId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const sqlClient = yield* SqlClient
    const scoreResult = yield* loadEligibleScoreOrCurrentOwner(input)

    if (scoreResult.action === "already-assigned") {
      return {
        action: "already-assigned",
        issueId: scoreResult.issueId,
      } satisfies AssignScoreToIssueResult
    }

    const score = scoreResult.score

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const outboxEventWriter = yield* OutboxEventWriter
        const scoreRepository = yield* ScoreRepository
        const issue = yield* issueRepository
          .findByIdForUpdate(IssueId(input.issueId))
          .pipe(
            Effect.catchTag("NotFoundError", () =>
              Effect.fail(new IssueNotFoundForAssignmentError({ issueId: input.issueId })),
            ),
          )

        if (issue.projectId !== score.projectId) {
          return yield* new IssueNotFoundForAssignmentError({ issueId: input.issueId })
        }

        const assignedAt = new Date()
        const updatedIssue = buildIssueWithAssignedScore({
          issue,
          score,
          normalizedEmbedding: input.normalizedEmbedding,
          assignedAt,
        })

        const claimed = yield* scoreRepository.assignIssueIfUnowned({
          scoreId: score.id,
          issueId: issue.id,
          updatedAt: assignedAt,
        })

        if (!claimed) {
          const currentScore = yield* scoreRepository
            .findById(score.id)
            .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
          if (currentScore && currentScore.issueId !== null) {
            return {
              action: "already-assigned",
              issueId: currentScore.issueId,
            } satisfies AssignScoreToIssueResult
          }

          return yield* new ScoreAlreadyOwnedByIssueError({ scoreId: score.id })
        }

        yield* issueRepository.save(updatedIssue)
        yield* outboxEventWriter.write({
          eventName: "ScoreAssignedToIssue",
          aggregateType: "score",
          aggregateId: score.id,
          organizationId: score.organizationId,
          payload: {
            organizationId: score.organizationId,
            projectId: score.projectId,
            issueId: issue.id,
          },
        })

        return {
          action: "assigned-existing",
          issueId: issue.id,
        } satisfies AssignScoreToIssueResult
      }),
    )
  }).pipe(Effect.withSpan("issues.assignScoreToIssue")) as Effect.Effect<
    AssignScoreToIssueResult,
    AssignScoreToIssueError
  >
