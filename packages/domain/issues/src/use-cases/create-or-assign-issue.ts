import { type Score, ScoreRepository } from "@domain/scores"
import { generateId, IssueId, OutboxEventWriter, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Issue } from "../entities/issue.ts"
import type { CheckEligibilityError } from "../errors.ts"
import { ScoreAlreadyOwnedByIssueError } from "../errors.ts"
import { createIssueCentroid, updateIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"

export interface AssignmentResult {
  readonly issueId: string
  readonly action: "created" | "assigned-existing" | "already-assigned"
}

export interface CreateOrAssignIssueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly matchedIssueId: string | null
  readonly normalizedEmbedding: readonly number[]
}

type CreateOrAssignIssueError = CheckEligibilityError | RepositoryError

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()

const buildFallbackIssueName = (feedback: string) => {
  const collapsed = collapseWhitespace(feedback)
  if (collapsed.length <= 128) {
    return collapsed
  }

  return `${collapsed.slice(0, 125).trimEnd()}...`
}

const buildFallbackIssueDescription = (feedback: string) => collapseWhitespace(feedback)

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

const buildNewIssueFromScore = ({
  score,
  normalizedEmbedding,
  assignedAt,
}: {
  readonly score: Score
  readonly normalizedEmbedding: readonly number[]
  readonly assignedAt: Date
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

  const description = buildFallbackIssueDescription(score.feedback)
  const name = buildFallbackIssueName(description)

  return {
    id: IssueId(generateId()),
    uuid: crypto.randomUUID(),
    organizationId: score.organizationId,
    projectId: score.projectId,
    name,
    description,
    centroid,
    clusteredAt: centroid.clusteredAt,
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: assignedAt,
    updatedAt: assignedAt,
  }
}

export const createOrAssignIssueUseCase = (input: CreateOrAssignIssueInput) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const issueRepository = yield* IssueRepository
        const outboxEventWriter = yield* OutboxEventWriter
        const scoreRepository = yield* ScoreRepository

        const score = yield* checkEligibilityUseCase(input)
        const assignedAt = new Date()
        const matchedIssue =
          input.matchedIssueId === null
            ? null
            : yield* issueRepository.findByUuid({
                projectId: ProjectId(score.projectId),
                uuid: input.matchedIssueId,
              })

        const issue =
          matchedIssue === null
            ? buildNewIssueFromScore({
                score,
                normalizedEmbedding: input.normalizedEmbedding,
                assignedAt,
              })
            : buildIssueWithAssignedScore({
                issue: matchedIssue,
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
          const currentScore = yield* scoreRepository.findById(score.id)
          if (currentScore && currentScore.issueId !== null) {
            return {
              action: "already-assigned",
              issueId: currentScore.issueId,
            } satisfies AssignmentResult
          }

          return yield* new ScoreAlreadyOwnedByIssueError({ scoreId: score.id })
        }

        yield* issueRepository.save(issue)

        if (matchedIssue !== null) {
          yield* outboxEventWriter.write({
            eventName: "IssueRefreshRequested",
            aggregateType: "score",
            aggregateId: score.id,
            organizationId: score.organizationId,
            payload: {
              organizationId: score.organizationId,
              projectId: score.projectId,
              issueId: issue.id,
            },
          })
        }

        return {
          action: matchedIssue === null ? "created" : "assigned-existing",
          issueId: issue.id,
        } satisfies AssignmentResult
      }),
    )
  }) as Effect.Effect<AssignmentResult, CreateOrAssignIssueError>
