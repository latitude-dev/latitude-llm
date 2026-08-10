import { resolveEmbeddingConfig } from "@domain/ai"
import { OutboxEventWriter } from "@domain/events"
import { ProjectRepository } from "@domain/projects"
import { type Score, ScoreRepository } from "@domain/scores"
import { generateId, type NotFoundError, ProjectId, type RepositoryError, ScoreId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { CO_OCCURRENCE_SAMPLE_LIMIT } from "../constants.ts"
import type { Signal, SignalPriority, SignalSource } from "../entities/signal.ts"
import type { CheckEligibilityError } from "../errors.ts"
import { ScoreAlreadyOwnedBySignalError } from "../errors.ts"
import { createSignalCentroid, updateSignalCentroid } from "../helpers.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { applySeverityFloor, flaggerSeverityFloor, isDeterministicFlagger } from "../severity-floor.ts"
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

/** Only flagger-authored annotation scores carry a detector slug. */
const flaggerSlugOf = (score: Score): string | undefined => {
  if (score.sourceType !== "annotation") return undefined
  const slug = (score.metadata as { flaggerSlug?: unknown } | null)?.flaggerSlug
  return typeof slug === "string" && slug.length > 0 ? slug : undefined
}

/**
 * Other detectors that matched the same session.
 *
 * Three checks firing on one conversation says something the prose of any single
 * one does not, and it is a fact rather than a reading of a sentence — the kind
 * of evidence the rating is short of. One indexed query on
 * `(organization_id, project_id, session_id, created_at, id)`.
 *
 * Best-effort by nature: the sibling scores are written during the same screening
 * pass, so a signal created from the first of them may see fewer than a signal
 * created from the last. An undercount weakens the evidence, it never invents any,
 * and a failed read is not worth blocking signal creation over.
 */
const coOccurringDetectors = (score: Score, exclude: string | undefined) =>
  Effect.gen(function* () {
    if (score.sessionId === null) return []
    const scoreRepository = yield* ScoreRepository
    const siblings = yield* scoreRepository.listPublishedSystemAnnotationsBySession({
      projectId: ProjectId(score.projectId),
      sessionId: score.sessionId,
      limit: CO_OCCURRENCE_SAMPLE_LIMIT,
    })
    const slugs = new Set<string>()
    for (const sibling of siblings) {
      if (sibling.id === score.id) continue
      const slug = flaggerSlugOf(sibling)
      if (slug !== undefined && slug !== exclude) slugs.add(slug)
    }
    return [...slugs].sort()
  }).pipe(Effect.catchCause(() => Effect.succeed<readonly string[]>([])))

const buildNewSignalFromScore = ({
  score,
  normalizedEmbedding,
  embeddingModel,
  assignedAt,
  name,
  description,
  priority,
  slug,
}: {
  readonly score: Score
  readonly normalizedEmbedding: readonly number[]
  readonly embeddingModel: string
  readonly assignedAt: Date
  readonly name: string
  readonly description: string
  readonly priority: SignalPriority | null
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
    priority,
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

    const flaggerSlug = flaggerSlugOf(initialScoreResult.score)
    // A deterministic detector already established what happened, so there is
    // nothing for a model to judge — asking anyway agreed with human triage on
    // none of the production signals these detectors opened. They start at `low`
    // and stay there until somebody triages them.
    const deterministic = isDeterministicFlagger(flaggerSlug)
    const alongside = yield* coOccurringDetectors(initialScoreResult.score, flaggerSlug)
    const signalDetails = yield* generateSignalDetailsUseCase({
      organizationId: input.organizationId,
      projectId: input.projectId,
      occurrences: [
        {
          sourceType: initialScoreResult.score.sourceType,
          feedback: initialScoreResult.score.feedback,
          value: initialScoreResult.score.value,
          machineAuthored: initialScoreResult.score.sourceId === "SYSTEM",
          ...(alongside.length === 0 ? {} : { coOccurringDetectors: alongside }),
          ...(flaggerSlug === undefined ? {} : { flaggerSlug }),
        },
      ],
      withSeverity: !deterministic,
    })
    // The model may rate higher than a detector's floor, never lower.
    const detectorFloor = flaggerSeverityFloor(flaggerSlug)
    const severity = deterministic
      ? (detectorFloor ?? "low")
      : applySeverityFloor(signalDetails.severity ?? null, detectorFloor)
    // `none` means the signal notifies nobody and dispatches nothing, which is
    // the one failure here that reaches a customer as silence. On the span rather
    // than a log line: `Effect.log*` has no Datadog bridge, so a span attribute
    // is what a monitor can actually alert on.
    yield* Effect.annotateCurrentSpan("severity", severity ?? "none")

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
        const issue = buildNewSignalFromScore({
          score,
          normalizedEmbedding: input.normalizedEmbedding,
          embeddingModel: embeddingConfig.model,
          assignedAt,
          name: signalDetails.name,
          description: signalDetails.description,
          // `priority` is the column and the public API field; `severity` is the
          // scale's name everywhere else. Same values, one list.
          priority: severity,
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
