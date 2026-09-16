import { type CacheError, ProjectId, type RepositoryError, SignalId } from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import {
  SIGNAL_DISCOVERY_BUNDLE_LOCK_KEY,
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
  /** Set only by deterministic detectors; see `findBundledSignalId`. */
  readonly bundleKey?: string
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
    // Must see unpromoted signals: matching into a candidate is how it accumulates
    // the evidence that promotes it.
    const candidates = yield* signalRepository.hybridSearch({
      projectId: ProjectId(input.projectId),
      query: search.feedback,
      normalizedEmbedding: search.normalizedEmbedding,
      includeUnpromoted: true,
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

/**
 * The exact path, and the reason a repeat failure does not fan out into a pile of
 * near-identical issues: a detector that already named the failure class matches on
 * that name, not on an embedding of the sentence it wrote about it. Two occurrences
 * of one broken tool differ in the ids and counts their messages quote, which is
 * exactly what the embedding is sensitive to and the key is not.
 */
const findBundledSignalId = (input: AssignOrCreateSignalInput, bundleKey: string) =>
  Effect.gen(function* () {
    const signalRepository = yield* SignalRepository
    const bundled = yield* signalRepository.findByBundleKey({
      projectId: ProjectId(input.projectId),
      bundleKey,
    })
    return bundled?.id ?? null
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

    const bundleKey = input.bundleKey
    if (bundleKey !== undefined) yield* Effect.annotateCurrentSpan("bundleKey", bundleKey)

    // The bucket, not the sentence: identical feedback is what the feedback lock
    // serializes, and a deterministic detector's feedback is not identical across
    // occurrences even when the failure is.
    const outerLockKey =
      bundleKey === undefined
        ? SIGNAL_DISCOVERY_FEEDBACK_LOCK_KEY(yield* hash(input.feedback))
        : SIGNAL_DISCOVERY_BUNDLE_LOCK_KEY(bundleKey)

    // On a bundle miss, fall back to the fuzzy path once and adopt the key onto
    // whatever it resolves to. Issues discovered before bundling existed carry no
    // key, so an exact-only lookup would open a duplicate beside every one of
    // them; adoption converges each bucket onto its existing issue on the first
    // occurrence and takes the exact path from then on.
    const findExistingSignalId = (candidateInput: AssignOrCreateSignalInput) =>
      bundleKey === undefined
        ? findAssignedSignalIdWithFallback(candidateInput)
        : Effect.gen(function* () {
            const bundled = yield* findBundledSignalId(candidateInput, bundleKey)
            if (bundled !== null) return bundled

            const fuzzy = yield* findAssignedSignalIdWithFallback(candidateInput)
            if (fuzzy === null) return null

            // Accepted only if the key is actually claimed. A fuzzy match that
            // already carries a different key *is* another bucket, and merging two
            // buckets is the one thing an exact key exists to prevent — so a failed
            // claim means this bucket opens its own issue instead.
            const signalRepository = yield* SignalRepository
            const adopted = yield* signalRepository.adoptBundleKey({
              signalId: SignalId(fuzzy),
              bundleKey,
            })
            yield* Effect.annotateCurrentSpan("bundleKeyAdopted", adopted)
            return adopted ? fuzzy : null
          })

    return yield* withSignalDiscoveryLock(
      {
        organizationId: input.organizationId,
        projectId: ProjectId(input.projectId),
        lockKey: outerLockKey,
        ttlSeconds: SIGNAL_DISCOVERY_FEEDBACK_LOCK_TTL_SECONDS,
      },
      Effect.gen(function* () {
        const feedbackAssignedSignalId = yield* findExistingSignalId(input)
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

            const projectAssignedSignalId = yield* findExistingSignalId(input)
            if (projectAssignedSignalId !== null) {
              return yield* assignToSignal(input, projectAssignedSignalId)
            }

            return yield* createSignal(input)
          }),
        )
      }),
    )
  }).pipe(Effect.withSpan("issues.assignOrCreateSignal"))
