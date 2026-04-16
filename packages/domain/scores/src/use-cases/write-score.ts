import { OutboxEventWriter } from "@domain/events"
import { BadRequestError, cuidSchema, generateId, ProjectId, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  annotationScoreSchema,
  baseScoreSchema,
  customScoreSchema,
  evaluationScoreSchema,
  type Score,
  scoreSchema,
} from "../entities/score.ts"
import { ScoreDraftClosedError, ScoreDraftUpdateConflictError } from "../errors.ts"
import { isImmutableScore } from "../helpers.ts"
import { ScoreRepository } from "../ports/score-repository.ts"
import { syncScoreAnalyticsUseCase } from "./save-score-analytics.ts"

const baseWritableScoreSchema = baseScoreSchema.omit({
  organizationId: true,
  errored: true,
  createdAt: true,
  updatedAt: true,
})

export const baseWriteScoreInputSchema = baseWritableScoreSchema.extend({
  id: baseScoreSchema.shape.id.optional(),
  projectId: cuidSchema.transform(ProjectId),
  sessionId: baseScoreSchema.shape.sessionId.default(null),
  traceId: baseScoreSchema.shape.traceId.default(null),
  spanId: baseScoreSchema.shape.spanId.default(null),
  simulationId: baseScoreSchema.shape.simulationId.default(null),
  issueId: baseScoreSchema.shape.issueId.default(null),
  error: baseScoreSchema.shape.error.default(null),
  duration: baseScoreSchema.shape.duration.default(0),
  tokens: baseScoreSchema.shape.tokens.default(0),
  cost: baseScoreSchema.shape.cost.default(0),
  draftedAt: baseScoreSchema.shape.draftedAt.default(null),
  annotatorId: baseScoreSchema.shape.annotatorId.default(null),
})
export type BaseWriteScoreInput = z.input<typeof baseWriteScoreInputSchema>

export const writeScoreInputSchema = z.discriminatedUnion("source", [
  baseWriteScoreInputSchema.extend({
    source: evaluationScoreSchema.shape.source,
    sourceId: evaluationScoreSchema.shape.sourceId,
    metadata: evaluationScoreSchema.shape.metadata,
  }),
  baseWriteScoreInputSchema.extend({
    source: annotationScoreSchema.shape.source,
    sourceId: annotationScoreSchema.shape.sourceId,
    metadata: annotationScoreSchema.shape.metadata,
  }),
  baseWriteScoreInputSchema.extend({
    source: customScoreSchema.shape.source,
    sourceId: customScoreSchema.shape.sourceId,
    metadata: customScoreSchema.shape.metadata,
  }),
])
export type WriteScoreInput = z.input<typeof writeScoreInputSchema>
type ParsedWriteScoreInput = z.output<typeof writeScoreInputSchema>

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export type WriteScoreError = RepositoryError | BadRequestError | ScoreDraftClosedError | ScoreDraftUpdateConflictError

const validateDraftUpdate = (existingScore: Score, input: ParsedWriteScoreInput) => {
  if (existingScore.projectId !== input.projectId) {
    return new ScoreDraftUpdateConflictError({ scoreId: existingScore.id, field: "projectId" })
  }

  if (existingScore.source !== input.source) {
    return new ScoreDraftUpdateConflictError({ scoreId: existingScore.id, field: "source" })
  }

  if (existingScore.sourceId !== input.sourceId) {
    return new ScoreDraftUpdateConflictError({ scoreId: existingScore.id, field: "sourceId" })
  }

  return null
}

const scoreDiscoveryPayloadIssueId = (score: Score, existingScore: Score | null): string | null => {
  if (
    existingScore !== null &&
    existingScore.draftedAt !== null &&
    existingScore.issueId !== null &&
    score.issueId === null
  ) {
    return existingScore.issueId
  }
  return null
}

const buildScore = ({
  input,
  organizationId,
  existingScore,
}: {
  readonly input: ParsedWriteScoreInput
  readonly organizationId: string
  readonly existingScore: Score | null
}) => {
  const now = new Date()

  return parseOrBadRequest(
    scoreSchema,
    {
      id: input.id ?? generateId<"ScoreId">(),
      organizationId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      traceId: input.traceId,
      spanId: input.spanId,
      source: input.source,
      sourceId: input.sourceId,
      simulationId: input.simulationId,
      issueId: input.issueId,
      value: input.value,
      passed: input.passed,
      feedback: input.feedback,
      metadata: input.metadata,
      error: input.error,
      errored: input.error !== null,
      duration: input.duration,
      tokens: input.tokens,
      cost: input.cost,
      draftedAt: input.draftedAt,
      annotatorId: existingScore?.annotatorId ?? input.annotatorId,
      createdAt: existingScore?.createdAt ?? now,
      updatedAt: now,
    },
    "Invalid score payload",
  )
}

export const writeScoreUseCase = (input: WriteScoreInput) =>
  Effect.gen(function* () {
    const parsedInput = yield* parseOrBadRequest(writeScoreInputSchema, input, "Invalid score write input")
    yield* Effect.annotateCurrentSpan("score.projectId", parsedInput.projectId)
    yield* Effect.annotateCurrentSpan("score.source", parsedInput.source)
    const sqlClient = yield* SqlClient

    const score = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        const outboxEventWriter = yield* OutboxEventWriter

        const existingScore = parsedInput.id
          ? yield* scoreRepository
              .findById(parsedInput.id)
              .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
          : null

        if (existingScore && existingScore.draftedAt === null) {
          return yield* new ScoreDraftClosedError({ scoreId: existingScore.id })
        }

        if (existingScore) {
          const conflict = validateDraftUpdate(existingScore, parsedInput)
          if (conflict) {
            return yield* conflict
          }
        }

        const score = yield* buildScore({
          input: parsedInput,
          organizationId: sqlClient.organizationId,
          existingScore,
        })

        yield* scoreRepository.save(score)

        yield* outboxEventWriter.write({
          eventName: "ScoreCreated",
          aggregateType: "score",
          aggregateId: score.id,
          organizationId: score.organizationId,
          payload: {
            organizationId: score.organizationId,
            projectId: score.projectId,
            scoreId: score.id,
            issueId: scoreDiscoveryPayloadIssueId(score, existingScore),
            status: score.draftedAt === null ? "published" : "draft",
          },
        })

        return score
      }),
    )

    if (isImmutableScore(score)) {
      yield* syncScoreAnalyticsUseCase({
        organizationId: score.organizationId,
        scoreId: score.id,
      })
    }

    return score
  }).pipe(Effect.withSpan("scores.writeScore"))
