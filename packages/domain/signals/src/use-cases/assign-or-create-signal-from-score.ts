import { type CacheError, ProjectId, type RepositoryError } from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import {
  SIGNAL_DISCOVERY_FEEDBACK_LOCK_KEY,
  SIGNAL_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS,
  SIGNAL_DISCOVERY_PROJECT_LOCK_KEY,
  SIGNAL_DISCOVERY_PROJECT_LOCK_TTL_SECONDS,
} from "../constants.ts"
import { type CheckEligibilityError, isEligibilityError, type SignalDiscoveryLockUnavailableError } from "../errors.ts"
import { withSignalDiscoveryLock } from "../locks.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import type { AssignScoreToSignalError, AssignScoreToSignalResult } from "./assign-score-to-signal.ts"
import { assignScoreToSignalUseCase } from "./assign-score-to-signal.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import {
  type CreateSignalFromScoreError,
  type CreateSignalFromScoreResult,
  createSignalFromScoreUseCase,
} from "./create-signal-from-score.ts"
import { rerankSignalCandidatesUseCase } from "./rerank-signal-candidates.ts"

export interface AssignOrCreateSignalInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly feedback: string
  readonly normalizedEmbedding: readonly number[]
  readonly rawFeedback?: string
  readonly rawNormalizedEmbedding?: readonly number[]
}

export type AssignOrCreateSignalResult =
  | AssignScoreToSignalResult
  | CreateSignalFromScoreResult
  | { readonly action: "skipped"; readonly reason: string }

export type AssignOrCreateSignalError =
  | AssignScoreToSignalError
  | CacheError
  | CheckEligibilityError
  | CreateSignalFromScoreError
  | CryptoError
  | SignalDiscoveryLockUnavailableError
  | RepositoryError

const checkEligibility = (input: AssignOrCreateSignalInput) =>
  checkEligibilityUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
  }).pipe(
    Effect.map(() => ({ status: "eligible" as const })),
    Effect.catchIf(isEligibilityError, (error) => Effect.succeed({ status: "skipped" as const, reason: error._tag })),
  )

const findAssignedSignalId = (
  input: AssignOrCreateSignalInput,
  search: { readonly feedback: string; readonly normalizedEmbedding: readonly number[] },
) =>
  Effect.gen(function* () {
    const signalRepository = yield* SignalRepository
    const candidates = yield* signalRepository.hybridSearch({
      projectId: ProjectId(input.projectId),
      query: search.feedback,
      normalizedEmbedding: search.normalizedEmbedding,
    })

    // TODO(signal-discovery-rerank): remove this third-party rerank step once we
    // calibrate pgvector-only assignment thresholds/margins. The candidate set
    // is small and already scored by the highest-quality embedding model, so
    // Postgres hybrid search should become the sole matching decision source.
    const retrieval = yield* rerankSignalCandidatesUseCase({
      query: search.feedback,
      candidates,
    })

    return retrieval.matchedSignalId
  })

const findAssignedSignalIdWithFallback = (input: AssignOrCreateSignalInput) =>
  Effect.gen(function* () {
    const feedbackAssignedSignalId = yield* findAssignedSignalId(input, {
      feedback: input.feedback,
      normalizedEmbedding: input.normalizedEmbedding,
    })
    if (feedbackAssignedSignalId !== null) return feedbackAssignedSignalId

    if (input.rawFeedback === undefined || input.rawNormalizedEmbedding === undefined) {
      return null
    }

    return yield* findAssignedSignalId(input, {
      feedback: input.rawFeedback,
      normalizedEmbedding: input.rawNormalizedEmbedding,
    })
  })

const assignToSignal = (input: AssignOrCreateSignalInput, signalId: string) =>
  assignScoreToSignalUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    signalId,
    normalizedEmbedding: input.normalizedEmbedding,
  })

const createSignal = (input: AssignOrCreateSignalInput) =>
  createSignalFromScoreUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    scoreId: input.scoreId,
    normalizedEmbedding: input.normalizedEmbedding,
  })

export const assignOrCreateSignalUseCase = (input: AssignOrCreateSignalInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)

    const feedbackHash = yield* hash(input.feedback)

    return yield* withSignalDiscoveryLock(
      {
        organizationId: input.organizationId,
        projectId: ProjectId(input.projectId),
        lockKey: SIGNAL_DISCOVERY_FEEDBACK_LOCK_KEY(feedbackHash),
        ttlSeconds: SIGNAL_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS,
      },
      Effect.gen(function* () {
        const feedbackAssignedSignalId = yield* findAssignedSignalIdWithFallback(input)
        if (feedbackAssignedSignalId !== null) {
          return yield* assignToSignal(input, feedbackAssignedSignalId)
        }

        return yield* withSignalDiscoveryLock(
          {
            organizationId: input.organizationId,
            projectId: ProjectId(input.projectId),
            lockKey: SIGNAL_DISCOVERY_PROJECT_LOCK_KEY,
            ttlSeconds: SIGNAL_DISCOVERY_PROJECT_LOCK_TTL_SECONDS,
          },
          Effect.gen(function* () {
            const eligibility = yield* checkEligibility(input)
            if (eligibility.status === "skipped") {
              return { action: "skipped" as const, reason: eligibility.reason }
            }

            const projectAssignedSignalId = yield* findAssignedSignalIdWithFallback(input)
            if (projectAssignedSignalId !== null) {
              return yield* assignToSignal(input, projectAssignedSignalId)
            }

            return yield* createSignal(input)
          }),
        )
      }),
    )
  }).pipe(Effect.withSpan("issues.assignOrCreateSignal"))
