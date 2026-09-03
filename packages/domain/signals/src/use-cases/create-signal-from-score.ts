import { type AIError, resolveEmbeddingConfig } from "@domain/ai"
import { OutboxEventWriter } from "@domain/events"
import { ProjectRepository } from "@domain/projects"
import { type Score, ScoreRepository } from "@domain/scores"
import {
  type CacheError,
  type CacheStore,
  type ChSqlClient,
  generateId,
  type NotFoundError,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  ScoreId,
  SqlClient,
} from "@domain/shared"
import type { SessionRepository } from "@domain/spans"
import { Effect } from "effect"
import { buildCandidatePlaceholder } from "../candidate-naming.ts"
import { PROMOTION_MIN_SESSIONS } from "../constants.ts"
import type { Signal, SignalSource } from "../entities/signal.ts"
import type { CheckEligibilityError } from "../errors.ts"
import { ScoreAlreadyOwnedBySignalError } from "../errors.ts"
import { createSignalCentroid, updateSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { promotionThresholdForVolume } from "../promotion.ts"
import { generateSignalSlug, type SignalSlugGenerationError } from "../slug.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import { resolveProjectSessionVolumeUseCase } from "./resolve-project-session-volume.ts"

export interface CreateSignalFromScoreInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly normalizedEmbedding: readonly number[]
}

export type CreateSignalFromScoreResult = {
  readonly signalId: string
  readonly action: "created" | "already-assigned"
}

export type CreateSignalFromScoreError =
  | AIError
  | CacheError
  | CheckEligibilityError
  | RepositoryError
  | NotFoundError
  | SignalSlugGenerationError

type LoadedEligibleScoreResult =
  | {
      readonly action: "ready"
      readonly score: Score
    }
  | {
      readonly action: "already-assigned"
      readonly signalId: string
    }

const loadEligibleScoreOrCurrentOwner = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}) =>
  checkEligibilityUseCase(input).pipe(
    Effect.map((score) => ({ action: "ready", score }) satisfies LoadedEligibleScoreResult),
    Effect.catchTag("ScoreAlreadyOwnedBySignalError", () =>
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        const currentScore = yield* scoreRepository
          .findById(ScoreId(input.scoreId))
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
        const existingSignalId = currentScore?.signalId

        if (existingSignalId != null) {
          return {
            action: "already-assigned",
            signalId: existingSignalId,
          } satisfies LoadedEligibleScoreResult
        }

        return yield* new ScoreAlreadyOwnedBySignalError({ scoreId: input.scoreId })
      }),
    ),
  )

const buildNewSignalFromScore = ({
  score,
  normalizedEmbedding,
  embeddingModel,
  assignedAt,
  name,
  description,
  slug,
}: {
  readonly score: Score
  readonly normalizedEmbedding: readonly number[]
  readonly embeddingModel: string
  readonly assignedAt: Date
  readonly name: string
  readonly description: string
  readonly slug: string
}): Signal => {
  const centroid = updateSignalCentroid({
    centroid: {
      ...createSignalCentroid(embeddingModel),
      clusteredAt: assignedAt,
    },
    score: {
      embedding: normalizedEmbedding,
      sourceType: score.sourceType,
      createdAt: score.createdAt,
    },
    operation: "add",
    timestamp: assignedAt,
  })

  const source: SignalSource =
    score.sourceType === "annotation" ? (score.sourceId === "SYSTEM" ? "flagger" : "annotation") : "custom"

  return {
    id: generateId<"SignalId">(),
    organizationId: score.organizationId,
    projectId: score.projectId,
    slug,
    name,
    description,
    source,
    origin: "system",
    scoreEvidence: [],
    assigneeId: null,
    priority: null,
    centroid,
    clusteredAt: centroid.clusteredAt,
    promotedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: null,
    mutedAt: null,
    feedback: null,
    createdAt: assignedAt,
    updatedAt: assignedAt,
  }
}

/** The creating score is one session, and there is no way for a new signal to have more. */
const SESSIONS_AT_CREATION = 1

/**
 * Whether a signal discovered now already clears the promotion gate.
 *
 * The threshold is clamped below by `PROMOTION_MIN_SESSIONS`, so one session can
 * only ever clear it where that floor admits one — testing the constant first
 * keeps the volume lookup (Redis, then ClickHouse) off the creation path in every
 * configuration that cannot use it, including the default. Without this the floor
 * is effectively 2 whatever it is configured to be, because the gate is otherwise
 * only ever evaluated when a *second* score arrives.
 *
 * Qualifying here still does not create a promoted signal: the row is written
 * unpromoted either way, and `promoteSignalUseCase` stamps the latch once the
 * signal has a name drawn from its cluster.
 */
const resolveQualifiesAtCreation = (input: CreateSignalFromScoreInput) =>
  Effect.gen(function* () {
    if (PROMOTION_MIN_SESSIONS > SESSIONS_AT_CREATION) return false

    const volume = yield* resolveProjectSessionVolumeUseCase({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
    })

    return SESSIONS_AT_CREATION >= promotionThresholdForVolume(volume)
  })

export const createSignalFromScoreUseCase = (input: CreateSignalFromScoreInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    const embeddingConfig = yield* resolveEmbeddingConfig()
    const initialScoreResult = yield* loadEligibleScoreOrCurrentOwner(input)
    if (initialScoreResult.action === "already-assigned") {
      return {
        action: "already-assigned",
        signalId: initialScoreResult.signalId,
      } satisfies CreateSignalFromScoreResult
    }

    // Resolved before the transaction: it reads Redis and ClickHouse, neither of
    // which belongs inside a Postgres transaction.
    const qualifiesAtCreation = yield* resolveQualifiesAtCreation(input)
    const sqlClient = yield* SqlClient

    const assignment = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const scoreRepository = yield* ScoreRepository
        const outboxEventWriter = yield* OutboxEventWriter
        const projectRepository = yield* ProjectRepository

        const scoreResult = yield* loadEligibleScoreOrCurrentOwner(input)
        if (scoreResult.action === "already-assigned") {
          return {
            action: "already-assigned",
            signalId: scoreResult.signalId,
          } satisfies CreateSignalFromScoreResult
        }

        const score = scoreResult.score
        const assignedAt = new Date()
        // Slug must be unique per organization (D15). Generated inside the
        // transaction so it's contention-aware (previous slugs in this org are
        // visible to the count) and so we don't have to retry on a
        // unique-constraint conflict.
        const project = yield* projectRepository.findById(score.projectId)
        const slug = yield* generateSignalSlug({
          projectSlug: project.slug,
          count: (slug) => signalRepository.countBySlug({ slug }),
        })
        const placeholder = buildCandidatePlaceholder(score.feedback)
        const issue = buildNewSignalFromScore({
          score,
          normalizedEmbedding: input.normalizedEmbedding,
          embeddingModel: embeddingConfig.model,
          assignedAt,
          name: placeholder.name,
          description: placeholder.description,
          slug,
        })

        const claimed = yield* scoreRepository.assignSignalIfUnowned({
          scoreId: score.id,
          signalId: issue.id,
          updatedAt: assignedAt,
        })

        if (!claimed) {
          const currentScore = yield* scoreRepository
            .findById(score.id)
            .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
          if (currentScore && currentScore.signalId !== null) {
            return {
              action: "already-assigned",
              signalId: currentScore.signalId,
            } satisfies CreateSignalFromScoreResult
          }

          return yield* new ScoreAlreadyOwnedBySignalError({ scoreId: score.id })
        }

        yield* signalRepository.save(issue)

        yield* outboxEventWriter.write({
          eventName: "SignalCreated",
          aggregateType: "issue",
          aggregateId: issue.id,
          organizationId: issue.organizationId,
          payload: {
            organizationId: issue.organizationId,
            projectId: issue.projectId,
            signalId: issue.id,
            createdAt: issue.createdAt.toISOString(),
          },
        })

        if (qualifiesAtCreation) {
          yield* outboxEventWriter.write({
            eventName: "SignalQualifiedForPromotion",
            aggregateType: "issue",
            aggregateId: issue.id,
            organizationId: issue.organizationId,
            payload: {
              organizationId: issue.organizationId,
              projectId: issue.projectId,
              signalId: issue.id,
              qualifiedAt: issue.createdAt.toISOString(),
              triggerScoreId: score.id,
            },
          })
        }

        return {
          action: "created",
          signalId: issue.id,
        } satisfies CreateSignalFromScoreResult
      }),
    )

    return assignment
    // As in `assignScoreToSignalUseCase`: this package erases its requirements, so
    // the promotion gate's cross-store needs are declared here or a caller that
    // forgets a layer fails at runtime inside one activity instead of at compile
    // time.
  }).pipe(Effect.withSpan("issues.createSignalFromScore")) as Effect.Effect<
    CreateSignalFromScoreResult,
    CreateSignalFromScoreError,
    CacheStore | ChSqlClient | ProjectRepository | SessionRepository
  >
