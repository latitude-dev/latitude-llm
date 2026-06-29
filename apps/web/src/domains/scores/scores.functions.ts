import { listScoresByTraceIdsUseCase, listTraceScoresUseCase, type Score, scoreDraftModeSchema } from "@domain/scores"
import { ProjectId } from "@domain/shared"
import { ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const toRecord = (score: Score) => ({
  id: score.id as string,
  organizationId: score.organizationId,
  projectId: score.projectId,
  sessionId: score.sessionId,
  traceId: score.traceId,
  spanId: score.spanId,
  source: score.sourceType,
  sourceId: score.sourceId,
  simulationId: score.simulationId,
  signalId: score.signalId,
  value: score.value,
  passed: score.passed,
  feedback: score.feedback,
  metadata: score.metadata,
  error: score.error,
  errored: score.errored,
  duration: score.duration,
  tokens: score.tokens,
  cost: score.cost,
  draftedAt: score.draftedAt ? score.draftedAt.toISOString() : null,
  annotatorId: score.annotatorId,
  createdAt: score.createdAt.toISOString(),
  updatedAt: score.updatedAt.toISOString(),
})

export type ScoreRecord = ReturnType<typeof toRecord>

const toListResult = (page: {
  readonly items: readonly Score[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}) => ({
  items: page.items.map(toRecord),
  hasMore: page.hasMore,
  limit: page.limit,
  offset: page.offset,
})

type ScoreListResult = ReturnType<typeof toListResult>

export const listScoresByTrace = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      draftMode: scoreDraftModeSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<ScoreListResult> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const result = await Effect.runPromise(
      listTraceScoresUseCase({
        projectId: data.projectId,
        traceId: data.traceId,
        limit: data.limit,
        offset: data.offset,
        draftMode: data.draftMode ?? "include",
      }).pipe(withPostgres(ScoreRepositoryLive, client, organizationId), withTracing),
    )

    return toListResult(result)
  })

/**
 * Every score across a set of traces (session panel Scores tab). Scopes by
 * `trace_id IN (...)` rather than `session_id` so orphan sessions still surface
 * their scores.
 */
export const listScoresBySession = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceIds: z.array(z.string().length(32)).max(500),
      limit: z.number().optional(),
      offset: z.number().optional(),
      draftMode: scoreDraftModeSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<ScoreListResult> => {
    if (data.traceIds.length === 0) {
      return { items: [], hasMore: false, limit: data.limit ?? 50, offset: data.offset ?? 0 }
    }

    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const result = await Effect.runPromise(
      listScoresByTraceIdsUseCase({
        projectId: data.projectId,
        traceIds: data.traceIds,
        limit: data.limit,
        offset: data.offset,
        draftMode: data.draftMode ?? "include",
      }).pipe(withPostgres(ScoreRepositoryLive, client, organizationId), withTracing),
    )

    return toListResult(result)
  })
