import {
  enrichAnnotationForPublicationUseCase,
  mergeEnrichmentIntoAnnotationScoreForPublication,
} from "@domain/annotations"
import { type AnnotationScore, ScoreRepository, writeScoreUseCase } from "@domain/scores"
import { BadRequestError, OrganizationId, ScoreId } from "@domain/shared"
import { withAi } from "@platform/ai"
import { AIGenerateLive } from "@platform/ai-vercel"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

export const enrichAnnotationForPublication = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
}) =>
  Effect.runPromise(
    enrichAnnotationForPublicationUseCase({ scoreId: ScoreId(input.scoreId) }).pipe(
      withPostgres(ScoreRepositoryLive, getPostgresClient(), OrganizationId(input.organizationId)),
      withClickHouse(
        Layer.mergeAll(TraceRepositoryLive, SpanRepositoryLive),
        getClickhouseClient(),
        OrganizationId(input.organizationId),
      ),
      withAi(AIGenerateLive, getRedisClient()),
    ),
  )

export const writePublishedAnnotationScore = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly enrichedFeedback: string | undefined
  readonly resolvedSessionId: string | null
  readonly resolvedSpanId: string | null
}) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const scoreRepository = yield* ScoreRepository

      const score = yield* scoreRepository
        .findById(ScoreId(input.scoreId))
        .pipe(
          Effect.catchTag("NotFoundError", () =>
            Effect.fail(new BadRequestError({ message: `Score ${input.scoreId} not found` })),
          ),
        )

      if (score.source !== "annotation") {
        return yield* new BadRequestError({
          message: `Score ${input.scoreId} is not an annotation (source: ${score.source})`,
        })
      }

      const toWrite = mergeEnrichmentIntoAnnotationScoreForPublication(score as AnnotationScore, {
        enrichedFeedback: input.enrichedFeedback ?? score.feedback,
        resolvedSessionId: input.resolvedSessionId,
        resolvedSpanId: input.resolvedSpanId,
      })

      yield* writeScoreUseCase(toWrite)
    }).pipe(
      withPostgres(
        Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive),
        getPostgresClient(),
        OrganizationId(input.organizationId),
      ),
      withClickHouse(ScoreAnalyticsRepositoryLive, getClickhouseClient(), OrganizationId(input.organizationId)),
    ),
  )
