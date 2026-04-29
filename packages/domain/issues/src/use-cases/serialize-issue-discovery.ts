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
import { IssueDiscoveryLockRepository } from "../ports/issue-discovery-lock-repository.ts"
import type { AssignScoreToIssueError, AssignScoreToIssueResult } from "./assign-score-to-issue.ts"
import { assignScoreToIssueUseCase } from "./assign-score-to-issue.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import type { CreateIssueFromScoreError, CreateIssueFromScoreResult } from "./create-issue-from-score.ts"
import { createIssueFromScoreUseCase } from "./create-issue-from-score.ts"
import { hybridSearchIssuesUseCase } from "./hybrid-search-issues.ts"
import { rerankIssueCandidatesUseCase } from "./rerank-issue-candidates.ts"
import { resolveMatchedIssueUseCase } from "./resolve-matched-issue.ts"

export interface SerializeIssueDiscoveryInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly feedback: string
  readonly normalizedEmbedding: readonly number[]
}

export type SerializeIssueDiscoveryResult =
  | AssignScoreToIssueResult
  | CreateIssueFromScoreResult
  | { readonly action: "skipped"; readonly reason: string }

export type SerializeIssueDiscoveryError =
  | AssignScoreToIssueError
  | CacheError
  | CheckEligibilityError
  | CreateIssueFromScoreError
  | CryptoError
  | IssueDiscoveryLockUnavailableError
  | RepositoryError

const checkEligibility = (input: SerializeIssueDiscoveryInput) =>
  checkEligibilityUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
  }).pipe(
    Effect.map(() => ({ status: "eligible" as const })),
    Effect.catchIf(isEligibilityError, (error) => Effect.succeed({ status: "skipped" as const, reason: error._tag })),
  )

const findMatchedIssueId = (input: SerializeIssueDiscoveryInput) =>
  Effect.gen(function* () {
    const hybridSearch = yield* hybridSearchIssuesUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      query: input.feedback,
      normalizedEmbedding: input.normalizedEmbedding as number[],
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

const assignToIssue = (input: SerializeIssueDiscoveryInput, issueId: string) =>
  assignScoreToIssueUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    issueId,
    normalizedEmbedding: input.normalizedEmbedding,
  })

const createIssue = (input: SerializeIssueDiscoveryInput) =>
  createIssueFromScoreUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    normalizedEmbedding: input.normalizedEmbedding,
  })

export const serializeIssueDiscoveryUseCase = (input: SerializeIssueDiscoveryInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const lockRepository = yield* IssueDiscoveryLockRepository
    const feedbackHash = yield* hash(input.feedback)

    return yield* lockRepository.withLock(
      {
        organizationId: input.organizationId,
        projectId: ProjectId(input.projectId),
        lockKey: ISSUE_DISCOVERY_FEEDBACK_LOCK_KEY(feedbackHash),
        ttlSeconds: ISSUE_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS,
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
            lockKey: ISSUE_DISCOVERY_PROJECT_LOCK_KEY,
            ttlSeconds: ISSUE_DISCOVERY_PROJECT_LOCK_TTL_SECONDS,
          },
          Effect.gen(function* () {
            const eligibility = yield* checkEligibility(input)
            if (eligibility.status === "skipped") {
              return { action: "skipped" as const, reason: eligibility.reason }
            }

            const projectMatchedIssueId = yield* findMatchedIssueId(input)
            if (projectMatchedIssueId !== null) {
              return yield* assignToIssue(input, projectMatchedIssueId)
            }

            return yield* createIssue(input)
          }),
        )
      }),
    )
  }).pipe(Effect.withSpan("issues.serializeIssueDiscovery"))
