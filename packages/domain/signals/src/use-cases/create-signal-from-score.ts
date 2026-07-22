import { resolveEmbeddingConfig } from "@domain/ai"
import { OutboxEventWriter } from "@domain/events"
import { ProjectRepository } from "@domain/projects"
import { type Score, ScoreRepository } from "@domain/scores"
import { generateId, type NotFoundError, ProjectId, type RepositoryError, ScoreId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Signal, SignalSource } from "../entities/signal.ts"
import type { CheckEligibilityError } from "../errors.ts"
import { ScoreAlreadyOwnedBySignalError } from "../errors.ts"
import { createSignalCentroid, updateSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { generateSignalSlug, type SignalSlugGenerationError } from "../slug.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import type { GenerateSignalDetailsError } from "./generate-signal-details.ts"
import { generateSignalDetailsUseCase } from "./generate-signal-details.ts"

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
  | CheckEligibilityError
  | GenerateSignalDetailsError
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
    assigneeId: null,
    priority: null,
    centroid,
    clusteredAt: centroid.clusteredAt,
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: null,
    mutedAt: null,
    createdAt: assignedAt,
    updatedAt: assignedAt,
  }
}

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

    const signalDetails = yield* generateSignalDetailsUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      occurrences: [
        {
          sourceType: initialScoreResult.score.sourceType,
          feedback: initialScoreResult.score.feedback,
        },
      ],
    })

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
        // Slug must be unique per (org, project). Generated inside the
        // transaction so it's contention-aware (previous slugs in this project
        // are visible to the existence check) and so we don't have to retry on
        // a unique-constraint conflict.
        const project = yield* projectRepository.findById(score.projectId)
        const slug = yield* generateSignalSlug({
          projectSlug: project.slug,
          count: (slug) => signalRepository.countBySlug({ projectId: ProjectId(score.projectId), slug }),
        })
        const issue = buildNewSignalFromScore({
          score,
          normalizedEmbedding: input.normalizedEmbedding,
          embeddingModel: embeddingConfig.model,
          assignedAt,
          name: signalDetails.name,
          description: signalDetails.description,
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

        return {
          action: "created",
          signalId: issue.id,
        } satisfies CreateSignalFromScoreResult
      }),
    )

    return assignment
  }).pipe(Effect.withSpan("issues.createSignalFromScore")) as Effect.Effect<
    CreateSignalFromScoreResult,
    CreateSignalFromScoreError,
    ProjectRepository
  >
