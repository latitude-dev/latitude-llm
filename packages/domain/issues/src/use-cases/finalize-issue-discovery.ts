import { ScoreRepository } from "@domain/scores"
import { type CacheError, ProjectId, type RepositoryError, ScoreId } from "@domain/shared"
import { Effect } from "effect"
import type { CheckEligibilityError, IssueDiscoveryLockUnavailableError } from "../errors.ts"
import { IssueDiscoveryLockRepository } from "../ports/issue-discovery-lock-repository.ts"
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
  | CacheError
  | CheckEligibilityError
  | CreateIssueFromScoreError
  | IssueDiscoveryLockUnavailableError
  | RepositoryError

// The outer feedback lock wraps retrieval, AI generation, and the inner project-lock section, so it needs to outlive
// the inner lock to prevent concurrent feedback duplicates from racing past it once it expires.
const FEEDBACK_LOCK_TTL_MS = 180_000
const PROJECT_LOCK_TTL_MS = 120_000

// FNV-1a 32-bit hash. Hashing keeps Redis keys bounded; collisions only over-lock (different feedback texts under
// the same source serialize together), which is safe — the project lock still gates issue creation.
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
        organizationId: input.organizationId,
        projectId: ProjectId(input.projectId),
        lockKey: buildFeedbackLockKey({ source: score.source, sourceId: score.sourceId, feedback: input.feedback }),
        ttlMs: FEEDBACK_LOCK_TTL_MS,
      },
      Effect.gen(function* () {
        const feedbackMatchedIssueId = yield* findMatchedIssueId(input)
        if (feedbackMatchedIssueId !== null) {
          return yield* assignToIssue(input, feedbackMatchedIssueId)
        }

        return yield* lockRepository.withLock(
          {
            organizationId: input.organizationId,
            projectId: ProjectId(input.projectId),
            lockKey: "project",
            ttlMs: PROJECT_LOCK_TTL_MS,
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
  }).pipe(Effect.withSpan("issues.finalizeIssueDiscovery"))
