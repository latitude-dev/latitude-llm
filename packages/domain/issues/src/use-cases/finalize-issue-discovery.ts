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

export const finalizeIssueDiscoveryUseCase = (input: FinalizeIssueDiscoveryInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const scoreRepository = yield* ScoreRepository
    yield* scoreRepository.findById(ScoreId(input.scoreId))
    const lockRepository = yield* IssueDiscoveryLockRepository

    return yield* lockRepository.withLock(
      {
        projectId: ProjectId(input.projectId),
        lockKey: "project",
      },
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

        if (matchedIssue.issueId !== null) {
          const assignment = yield* assignScoreToIssueUseCase({
            organizationId: input.organizationId,
            projectId: input.projectId,
            scoreId: input.scoreId,
            issueId: matchedIssue.issueId,
            normalizedEmbedding: input.normalizedEmbedding,
          })

          yield* syncIssueProjectionsUseCase({ organizationId: input.organizationId, issueId: assignment.issueId })
          return assignment
        }

        const assignment = yield* createIssueFromScoreUseCase({
          organizationId: input.organizationId,
          projectId: input.projectId,
          scoreId: input.scoreId,
          normalizedEmbedding: input.normalizedEmbedding,
        })

        yield* syncIssueProjectionsUseCase({ organizationId: input.organizationId, issueId: assignment.issueId })
        return assignment
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
