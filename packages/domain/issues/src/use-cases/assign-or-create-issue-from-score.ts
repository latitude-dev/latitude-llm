import { type CacheError, ProjectId, type RepositoryError } from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import {
  ISSUE_DISCOVERY_FEEDBACK_LOCK_KEY,
  ISSUE_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS,
  ISSUE_DISCOVERY_PROJECT_LOCK_KEY,
  ISSUE_DISCOVERY_PROJECT_LOCK_TTL_SECONDS,
} from "../constants.ts"
import { type CheckEligibilityError, type IssueDiscoveryLockUnavailableError, isEligibilityError } from "../errors.ts"
import { withIssueDiscoveryLock } from "../locks.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import type { AssignScoreToIssueError, AssignScoreToIssueResult } from "./assign-score-to-issue.ts"
import { assignScoreToIssueUseCase } from "./assign-score-to-issue.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import {
  type CreateIssueFromScoreError,
  type CreateIssueFromScoreResult,
  createIssueFromScoreUseCase,
} from "./create-issue-from-score.ts"
import { rerankIssueCandidatesUseCase } from "./rerank-issue-candidates.ts"

export interface AssignOrCreateIssueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly feedback: string
  readonly normalizedEmbedding: readonly number[]
  readonly rawFeedback?: string
  readonly rawNormalizedEmbedding?: readonly number[]
}

export type AssignOrCreateIssueResult =
  | AssignScoreToIssueResult
  | CreateIssueFromScoreResult
  | { readonly action: "skipped"; readonly reason: string }

export type AssignOrCreateIssueError =
  | AssignScoreToIssueError
  | CacheError
  | CheckEligibilityError
  | CreateIssueFromScoreError
  | CryptoError
  | IssueDiscoveryLockUnavailableError
  | RepositoryError

const checkEligibility = (input: AssignOrCreateIssueInput) =>
  checkEligibilityUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
  }).pipe(
    Effect.map(() => ({ status: "eligible" as const })),
    Effect.catchIf(isEligibilityError, (error) => Effect.succeed({ status: "skipped" as const, reason: error._tag })),
  )

const findAssignedIssueId = (
  input: AssignOrCreateIssueInput,
  search: { readonly feedback: string; readonly normalizedEmbedding: readonly number[] },
) =>
  Effect.gen(function* () {
    const issueRepository = yield* IssueRepository
    const candidates = yield* issueRepository.hybridSearch({
      projectId: ProjectId(input.projectId),
      query: search.feedback,
      normalizedEmbedding: search.normalizedEmbedding,
    })

    // TODO(issue-discovery-rerank): remove this third-party rerank step once we
    // calibrate pgvector-only assignment thresholds/margins. The candidate set
    // is small and already scored by the highest-quality embedding model, so
    // Postgres hybrid search should become the sole matching decision source.
    const retrieval = yield* rerankIssueCandidatesUseCase({
      query: search.feedback,
      candidates,
    })

    return retrieval.matchedIssueId
  })

const findAssignedIssueIdWithFallback = (input: AssignOrCreateIssueInput) =>
  Effect.gen(function* () {
    const feedbackAssignedIssueId = yield* findAssignedIssueId(input, {
      feedback: input.feedback,
      normalizedEmbedding: input.normalizedEmbedding,
    })
    if (feedbackAssignedIssueId !== null) return feedbackAssignedIssueId

    if (input.rawFeedback === undefined || input.rawNormalizedEmbedding === undefined) {
      return null
    }

    return yield* findAssignedIssueId(input, {
      feedback: input.rawFeedback,
      normalizedEmbedding: input.rawNormalizedEmbedding,
    })
  })

const assignToIssue = (input: AssignOrCreateIssueInput, issueId: string) =>
  assignScoreToIssueUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    issueId,
    normalizedEmbedding: input.normalizedEmbedding,
  })

const createIssue = (input: AssignOrCreateIssueInput) =>
  createIssueFromScoreUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    normalizedEmbedding: input.normalizedEmbedding,
  })

export const assignOrCreateIssueUseCase = (input: AssignOrCreateIssueInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const feedbackHash = yield* hash(input.feedback)

    return yield* withIssueDiscoveryLock(
      {
        organizationId: input.organizationId,
        projectId: ProjectId(input.projectId),
        lockKey: ISSUE_DISCOVERY_FEEDBACK_LOCK_KEY(feedbackHash),
        ttlSeconds: ISSUE_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS,
      },
      Effect.gen(function* () {
        const feedbackAssignedIssueId = yield* findAssignedIssueIdWithFallback(input)
        if (feedbackAssignedIssueId !== null) {
          return yield* assignToIssue(input, feedbackAssignedIssueId)
        }

        return yield* withIssueDiscoveryLock(
          {
            organizationId: input.organizationId,
            projectId: ProjectId(input.projectId),
            lockKey: ISSUE_DISCOVERY_PROJECT_LOCK_KEY,
            ttlSeconds: ISSUE_DISCOVERY_PROJECT_LOCK_TTL_SECONDS,
          },
          Effect.gen(function* () {
            const eligibility = yield* checkEligibility(input)
            if (eligibility.status === "skipped") {
              return { action: "skipped" as const, reason: eligibility.reason }
            }

            const projectAssignedIssueId = yield* findAssignedIssueIdWithFallback(input)
            if (projectAssignedIssueId !== null) {
              return yield* assignToIssue(input, projectAssignedIssueId)
            }

            return yield* createIssue(input)
          }),
        )
      }),
    )
  }).pipe(Effect.withSpan("issues.assignOrCreateIssue"))
