import type { AI } from "@domain/ai"
import type { OutboxEventWriter } from "@domain/events"
import { ScoreRepository } from "@domain/scores"
import { ProjectId, type RepositoryError, ScoreId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { CheckEligibilityError } from "../errors.ts"
import { IssueDiscoveryLockRepository } from "../ports/issue-discovery-lock-repository.ts"
import type { IssueProjectionRepository } from "../ports/issue-projection-repository.ts"
import type { IssueRepository } from "../ports/issue-repository.ts"
import type { AssignScoreToIssueError, AssignScoreToIssueResult } from "./assign-score-to-issue.ts"
import { assignScoreToIssueUseCase } from "./assign-score-to-issue.ts"
import type { CreateIssueFromScoreError, CreateIssueFromScoreResult } from "./create-issue-from-score.ts"
import { createIssueFromScoreUseCase } from "./create-issue-from-score.ts"
import { hybridSearchIssuesUseCase } from "./hybrid-search-issues.ts"
import { rerankIssueCandidatesUseCase } from "./rerank-issue-candidates.ts"
import { resolveMatchedIssueUseCase } from "./resolve-matched-issue.ts"
import { syncIssueProjectionsUseCase } from "./sync-projections.ts"

export interface FinalizeIssueDiscoveryInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly feedback: string
  readonly normalizedEmbedding: readonly number[]
}

export type FinalizeIssueDiscoveryResult = AssignScoreToIssueResult | CreateIssueFromScoreResult

export type FinalizeIssueDiscoveryError =
  | AssignScoreToIssueError
  | CheckEligibilityError
  | CreateIssueFromScoreError
  | RepositoryError

const hashLockComponent = (value: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

const buildFeedbackLockKey = (input: {
  readonly source: string
  readonly sourceId: string
  readonly feedback: string
}) => `feedback:${input.source}:${input.sourceId}:${hashLockComponent(input.feedback)}`

const findMatchedIssueId = (input: FinalizeIssueDiscoveryInput) =>
  Effect.gen(function* () {
    const hybridSearch = yield* hybridSearchIssuesUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      query: input.feedback,
      normalizedEmbedding: [...input.normalizedEmbedding],
    })

    const retrieval = yield* rerankIssueCandidatesUseCase({
      query: input.feedback,
      candidates: hybridSearch.candidates,
    })

    const matchedIssue = yield* resolveMatchedIssueUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      matchedIssueUuid: retrieval.matchedIssueUuid,
    })

    return matchedIssue.issueId
  })

const assignToIssue = (input: FinalizeIssueDiscoveryInput, issueId: string) =>
  Effect.gen(function* () {
    const assignment = yield* assignScoreToIssueUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      issueId,
      normalizedEmbedding: input.normalizedEmbedding,
    })

    yield* syncIssueProjectionsUseCase({ organizationId: input.organizationId, issueId: assignment.issueId })
    return assignment
  })

const createIssue = (input: FinalizeIssueDiscoveryInput) =>
  Effect.gen(function* () {
    const assignment = yield* createIssueFromScoreUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      normalizedEmbedding: input.normalizedEmbedding,
    })

    yield* syncIssueProjectionsUseCase({ organizationId: input.organizationId, issueId: assignment.issueId })
    return assignment
  })

export const finalizeIssueDiscoveryUseCase = (input: FinalizeIssueDiscoveryInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const scoreRepository = yield* ScoreRepository
    const score = yield* scoreRepository.findById(ScoreId(input.scoreId))
    const lockRepository = yield* IssueDiscoveryLockRepository

    return yield* lockRepository.withLock(
      {
        projectId: ProjectId(input.projectId),
        lockKey: buildFeedbackLockKey({ source: score.source, sourceId: score.sourceId, feedback: input.feedback }),
      },
      Effect.gen(function* () {
        const feedbackMatchedIssueId = yield* findMatchedIssueId(input)
        if (feedbackMatchedIssueId !== null) {
          return yield* assignToIssue(input, feedbackMatchedIssueId)
        }

        return yield* lockRepository.withLock(
          {
            projectId: ProjectId(input.projectId),
            lockKey: "project",
          },
          Effect.gen(function* () {
            const projectMatchedIssueId = yield* findMatchedIssueId(input)
            if (projectMatchedIssueId !== null) {
              return yield* assignToIssue(input, projectMatchedIssueId)
            }

            return yield* createIssue(input)
          }),
        )
      }),
    )
  }).pipe(Effect.withSpan("issues.finalizeIssueDiscovery")) as Effect.Effect<
    FinalizeIssueDiscoveryResult,
    FinalizeIssueDiscoveryError,
    | IssueDiscoveryLockRepository
    | AI
    | ScoreRepository
    | OutboxEventWriter
    | SqlClient
    | IssueProjectionRepository
    | IssueRepository
  >
