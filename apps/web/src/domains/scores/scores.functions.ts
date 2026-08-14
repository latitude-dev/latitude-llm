import { EvaluationRepository } from "@domain/evaluations"
import {
  listScoresByTraceIdsUseCase,
  listTraceScoresUseCase,
  type Score,
  type ScoreListPage,
  type ScoreSourceType,
  scoreDraftModeSchema,
} from "@domain/scores"
import { EvaluationRepositoryLive, ScoreRepositoryLive } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getPostgresClient } from "../../server/clients.ts"
import { traceIdSchema } from "../../server/id-validation.ts"
import { resolveOrgScope } from "../../server/resolve-org-scope.ts"
import { withScopedPostgres } from "../../server/scoped-postgres.ts"

export interface ScoreRecord {
  readonly id: string
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string | null
  readonly traceId: string | null
  readonly spanId: string | null
  readonly source: ScoreSourceType
  readonly sourceId: string
  readonly simulationId: string | null
  readonly signalId: string | null
  readonly evaluationSignalId: string | null
  readonly value: number
  readonly passed: boolean
  readonly feedback: string
  // biome-ignore lint/complexity/noBannedTypes: TanStack createServerFn needs a serializable return; `unknown` isn't assignable and collapses the client-inferred type
  readonly metadata: { readonly [key: string]: {} }
  readonly error: string | null
  readonly errored: boolean
  readonly duration: number
  readonly tokens: number
  readonly cost: number
  readonly draftedAt: string | null
  readonly annotatorId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

interface EvaluationLookup {
  readonly signalId: string
}

const toRecord = (score: Score, evaluation: EvaluationLookup | undefined): ScoreRecord => ({
  id: score.id as string,
  organizationId: score.organizationId as string,
  projectId: score.projectId as string,
  sessionId: score.sessionId ? (score.sessionId as string) : null,
  traceId: score.traceId ? (score.traceId as string) : null,
  spanId: score.spanId ? (score.spanId as string) : null,
  source: score.sourceType,
  sourceId: score.sourceId,
  simulationId: score.simulationId ? (score.simulationId as string) : null,
  signalId: score.signalId ? (score.signalId as string) : null,
  evaluationSignalId: score.sourceType === "evaluation" ? (evaluation?.signalId ?? null) : null,
  value: score.value,
  passed: score.passed,
  feedback: score.feedback,
  // biome-ignore lint/complexity/noBannedTypes: matches the serializable `ScoreRecord.metadata` shape above
  metadata: score.metadata as { [key: string]: {} },
  error: score.error,
  errored: score.errored,
  duration: score.duration,
  tokens: score.tokens,
  cost: score.cost,
  draftedAt: score.draftedAt ? score.draftedAt.toISOString() : null,
  annotatorId: score.annotatorId ? (score.annotatorId as string) : null,
  createdAt: score.createdAt.toISOString(),
  updatedAt: score.updatedAt.toISOString(),
})

const loadEvaluationsById = (sourceIds: readonly string[]) =>
  Effect.gen(function* () {
    const uniqueIds = [...new Set(sourceIds)]
    if (uniqueIds.length === 0) return new Map<string, EvaluationLookup>()

    const evaluationRepository = yield* EvaluationRepository
    const found = yield* Effect.forEach(
      uniqueIds,
      (id) => evaluationRepository.findById(id).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
      { concurrency: 8 },
    )

    const byId = new Map<string, EvaluationLookup>()
    for (const evaluation of found) {
      if (!evaluation) continue
      byId.set(evaluation.id as string, { signalId: evaluation.signalId })
    }
    return byId
  })

const toListResult = (page: ScoreListPage, evaluationsById: ReadonlyMap<string, EvaluationLookup>) => ({
  items: page.items.map((score) =>
    toRecord(score, score.sourceType === "evaluation" ? evaluationsById.get(score.sourceId) : undefined),
  ),
  hasMore: page.hasMore,
  limit: page.limit,
  offset: page.offset,
})

const scoresWithEvaluationsLayer = Layer.mergeAll(ScoreRepositoryLive, EvaluationRepositoryLive)

const withEvaluationNames = (page: ScoreListPage) =>
  Effect.gen(function* () {
    const evaluationsById = yield* loadEvaluationsById(
      page.items.filter((score) => score.sourceType === "evaluation").map((score) => score.sourceId),
    )
    return toListResult(page, evaluationsById)
  })

type ScoreListResult = ReturnType<typeof toListResult>

export const listScoresByTrace = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: traceIdSchema,
      limit: z.number().optional(),
      offset: z.number().optional(),
      draftMode: scoreDraftModeSchema.optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ScoreListResult> => {
    const organizationId = await resolveOrgScope(context)
    const client = getPostgresClient()

    return await Effect.runPromise(
      listTraceScoresUseCase({
        projectId: data.projectId,
        traceId: data.traceId,
        limit: data.limit,
        offset: data.offset,
        draftMode: data.draftMode ?? "include",
      }).pipe(
        Effect.flatMap(withEvaluationNames),
        withScopedPostgres(scoresWithEvaluationsLayer, client, organizationId),
        withTracing,
      ),
    )
  })

/**
 * Every score across a set of traces (session panel Scores tab). Scopes by
 * `trace_id IN (...)` rather than `session_id` so orphan sessions still surface
 * their scores.
 */
// POST keeps the up-to-500 trace-id payload below HTTP request-line limits.
export const listScoresBySession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceIds: z.array(traceIdSchema).max(500),
      limit: z.number().optional(),
      offset: z.number().optional(),
      draftMode: scoreDraftModeSchema.optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ScoreListResult> => {
    if (data.traceIds.length === 0) {
      return { items: [], hasMore: false, limit: data.limit ?? 50, offset: data.offset ?? 0 }
    }

    const organizationId = await resolveOrgScope(context)
    const client = getPostgresClient()

    return await Effect.runPromise(
      listScoresByTraceIdsUseCase({
        projectId: data.projectId,
        traceIds: data.traceIds,
        limit: data.limit,
        offset: data.offset,
        draftMode: data.draftMode ?? "include",
      }).pipe(
        Effect.flatMap(withEvaluationNames),
        withScopedPostgres(scoresWithEvaluationsLayer, client, organizationId),
        withTracing,
      ),
    )
  })
