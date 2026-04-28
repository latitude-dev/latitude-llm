import { type Score, ScoreRepository } from "@domain/scores"
import { generateId, type RepositoryError, ScoreId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Issue, IssueKind, IssueSource } from "../entities/issue.ts"
import type { CheckEligibilityError } from "../errors.ts"
import { ScoreAlreadyOwnedByIssueError } from "../errors.ts"
import { createIssueCentroid, updateIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import type { GenerateIssueDetailsError } from "./generate-issue-details.ts"
import { generateIssueDetailsUseCase } from "./generate-issue-details.ts"

export interface CreateIssueFromScoreInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly normalizedEmbedding: readonly number[]
}

export type CreateIssueFromScoreResult = {
  readonly issueId: string
  readonly action: "created" | "already-assigned"
}

export type CreateIssueFromScoreError = CheckEligibilityError | GenerateIssueDetailsError | RepositoryError

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

const buildNewIssueFromScore = ({
  score,
  normalizedEmbedding,
  assignedAt,
  name,
  description,
}: {
  readonly score: Score
  readonly normalizedEmbedding: readonly number[]
  readonly assignedAt: Date
  readonly name: string
  readonly description: string
}): Issue => {
  const centroid = updateIssueCentroid({
    centroid: {
      ...createIssueCentroid(),
      clusteredAt: assignedAt,
    },
    score: {
      embedding: normalizedEmbedding,
      source: score.source,
      createdAt: score.createdAt,
    },
    operation: "add",
    timestamp: assignedAt,
  })

  const source: IssueSource =
    score.source === "flagger" ? "flagger" : score.source === "annotation" ? "annotation" : "custom"
  const kind: IssueKind = score.source === "flagger" && score.draftedAt !== null ? "potential" : "regular"

  return {
    id: generateId<"IssueId">(),
    uuid: crypto.randomUUID(),
    organizationId: score.organizationId,
    projectId: score.projectId,
    name,
    description,
    source,
    kind,
    centroid,
    clusteredAt: centroid.clusteredAt,
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: assignedAt,
    updatedAt: assignedAt,
  }
}

export const createIssueFromScoreUseCase = (input: CreateIssueFromScoreInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const initialScoreResult = yield* loadEligibleScoreOrCurrentOwner(input)
    if (initialScoreResult.action === "already-assigned") {
      return {
        action: "already-assigned",
        issueId: initialScoreResult.issueId,
      } satisfies CreateIssueFromScoreResult
    }

    const issueDetails = yield* generateIssueDetailsUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      occurrences: [
        {
          source: initialScoreResult.score.source,
          feedback: initialScoreResult.score.feedback,
        },
      ],
    })

    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const scoreRepository = yield* ScoreRepository

        const scoreResult = yield* loadEligibleScoreOrCurrentOwner(input)
        if (scoreResult.action === "already-assigned") {
          return {
            action: "already-assigned",
            issueId: scoreResult.issueId,
          } satisfies CreateIssueFromScoreResult
        }

        const score = scoreResult.score
        const assignedAt = new Date()
        const issue = buildNewIssueFromScore({
          score,
          normalizedEmbedding: input.normalizedEmbedding,
          assignedAt,
          name: issueDetails.name,
          description: issueDetails.description,
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
            } satisfies CreateIssueFromScoreResult
          }

          return yield* new ScoreAlreadyOwnedByIssueError({ scoreId: score.id })
        }

        yield* issueRepository.save(issue)

        return {
          action: "created",
          issueId: issue.id,
        } satisfies CreateIssueFromScoreResult
      }),
    )
  }).pipe(Effect.withSpan("issues.createIssueFromScore")) as Effect.Effect<
    CreateIssueFromScoreResult,
    CreateIssueFromScoreError
  >
