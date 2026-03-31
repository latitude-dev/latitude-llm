import { deleteAnnotationUseCase, listTraceAnnotationsUseCase, writeAnnotationUseCase } from "@domain/annotations"
import type { AnnotationScore, ScoreListPage } from "@domain/scores"
import { annotationAnchorSchema, scoreDraftModeSchema } from "@domain/scores"
import { ProjectId, ScoreId } from "@domain/shared"
import {
  ScoreAnalyticsRepositoryLive,
  SpanRepositoryLive,
  TraceRepositoryLive,
  withClickHouse,
} from "@platform/db-clickhouse"
import { OutboxEventWriterLive, ScoreRepositoryLive, withPostgres } from "@platform/db-postgres"
import { QueuePublisherLive } from "@platform/queue-bullmq"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient, getQueuePublisher } from "../../server/clients.ts"

const toRecord = (score: AnnotationScore) => ({
  id: score.id as string,
  organizationId: score.organizationId,
  projectId: score.projectId,
  sessionId: score.sessionId,
  traceId: score.traceId,
  spanId: score.spanId,
  source: score.source,
  sourceId: score.sourceId,
  simulationId: score.simulationId,
  issueId: score.issueId,
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
  createdAt: score.createdAt.toISOString(),
  updatedAt: score.updatedAt.toISOString(),
})
type AnnotationRecord = ReturnType<typeof toRecord>

const toListResult = (page: ScoreListPage) => ({
  items: page.items.map((s) => toRecord(s as AnnotationScore)),
  hasMore: page.hasMore,
  limit: page.limit,
  offset: page.offset,
})

type AnnotationListResult = ReturnType<typeof toListResult>

export const createAnnotation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string().length(32),
      spanId: z.string().optional(),
      sessionId: z.string().optional(),
      value: z.number(),
      passed: z.boolean(),
      feedback: z.string().min(1),
      anchor: annotationAnchorSchema.optional(),
      issueId: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AnnotationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const chClient = getClickhouseClient()
    const publisher = await getQueuePublisher()

    const repositoriesLayer = Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive, QueuePublisherLive(publisher))

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        projectId: ProjectId(data.projectId),
        sourceId: "UI",
        traceId: data.traceId,
        spanId: data.spanId ?? null,
        sessionId: data.sessionId ?? null,
        issueId: data.issueId ?? null,
        value: data.value,
        passed: data.passed,
        feedback: data.feedback,
        anchor: data.anchor,
      }).pipe(
        withPostgres(repositoriesLayer, client, organizationId),
        withClickHouse(Layer.merge(TraceRepositoryLive, SpanRepositoryLive), chClient, organizationId),
      ),
    )

    return toRecord(score)
  })

export const updateAnnotation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      scoreId: z.string(),
      projectId: z.string(),
      traceId: z.string().length(32),
      value: z.number(),
      passed: z.boolean(),
      feedback: z.string().min(1),
      anchor: annotationAnchorSchema.optional(),
      issueId: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<AnnotationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const chClient = getClickhouseClient()
    const publisher = await getQueuePublisher()

    const repositoriesLayer = Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive, QueuePublisherLive(publisher))

    const score = await Effect.runPromise(
      writeAnnotationUseCase({
        id: ScoreId(data.scoreId),
        projectId: ProjectId(data.projectId),
        sourceId: "UI",
        traceId: data.traceId,
        issueId: data.issueId ?? null,
        value: data.value,
        passed: data.passed,
        feedback: data.feedback,
        anchor: data.anchor,
      }).pipe(
        withPostgres(repositoriesLayer, client, organizationId),
        withClickHouse(Layer.merge(TraceRepositoryLive, SpanRepositoryLive), chClient, organizationId),
      ),
    )

    return toRecord(score)
  })

export const deleteAnnotation = createServerFn({ method: "POST" })
  .inputValidator(z.object({ scoreId: z.string(), projectId: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const repositoriesLayer = Layer.mergeAll(ScoreRepositoryLive, ScoreAnalyticsRepositoryLive)

    await Effect.runPromise(
      deleteAnnotationUseCase({ scoreId: ScoreId(data.scoreId) }).pipe(
        withPostgres(repositoriesLayer, pgClient, organizationId),
        withClickHouse(ScoreAnalyticsRepositoryLive, chClient, organizationId),
      ),
    )
  })

export const listAnnotationsByTrace = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      traceId: z.string(),
      limit: z.number().optional(),
      offset: z.number().optional(),
      draftMode: scoreDraftModeSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<AnnotationListResult> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const result = await Effect.runPromise(
      listTraceAnnotationsUseCase({
        projectId: data.projectId,
        traceId: data.traceId,
        limit: data.limit,
        offset: data.offset,
        draftMode: data.draftMode ?? "include", // draft-aware by default for trace-scoped reads
      }).pipe(withPostgres(ScoreRepositoryLive, client, organizationId)),
    )

    return toListResult(result)
  })
