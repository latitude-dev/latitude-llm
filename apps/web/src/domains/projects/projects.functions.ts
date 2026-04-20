import { DatasetRepository } from "@domain/datasets"
import { IssueProjectionRepository, listIssuesUseCase } from "@domain/issues"
import type { Project } from "@domain/projects"
import { createProjectUseCase, ProjectRepository, updateProjectUseCase } from "@domain/projects"
import { isValidId, OrganizationId, ProjectId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { withAi } from "@platform/ai"
import { AIEmbedLive } from "@platform/ai-voyage"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  DatasetRepositoryLive,
  EvaluationRepositoryLive,
  IssueRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getOutboxWriter, getPostgresClient, getRedisClient } from "../../server/clients.ts"

const logger = createLogger("project-stats")

const toRecord = (project: Project) => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  settings: {
    keepMonitoring: project.settings?.keepMonitoring,
  },
  deletedAt: project.deletedAt ? project.deletedAt.toISOString() : null,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
})

export type ProjectRecord = ReturnType<typeof toRecord>

export const listProjects = createServerFn({ method: "GET" }).handler(async (): Promise<ProjectRecord[]> => {
  const { organizationId } = await requireSession()
  const client = getPostgresClient()

  const projects = await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      return yield* repo.list()
    }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId), withTracing),
  )

  return projects.map(toRecord)
})

export const getProjectBySlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string() }))
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findBySlug(data.slug)
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId), withTracing),
    )

    return toRecord(project)
  })

export const createProject = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z
        .string()
        .optional()
        .refine((value) => value === undefined || isValidId(value), {
          message: "Invalid project id",
        }),
      name: z.string(),
    }),
  )
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      createProjectUseCase({
        ...(data.id ? { id: ProjectId(data.id) } : {}),
        name: data.name,
        actorUserId: userId,
      }).pipe(
        withPostgres(Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive), client, organizationId),
        withTracing,
      ),
    )

    return toRecord(project)
  })

const projectSettingsSchema = z.object({
  keepMonitoring: z.boolean().optional(),
})

export const updateProject = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1, { message: "Name is required" }).optional(),
      settings: projectSettingsSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      updateProjectUseCase({ id: ProjectId(data.id), name: data.name, settings: data.settings }).pipe(
        withPostgres(ProjectRepositoryLive, client, organizationId),
        withTracing,
      ),
    )

    return toRecord(project)
  })

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.softDelete(ProjectId(data.id))
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId), withTracing),
    )

    const outboxWriter = getOutboxWriter()
    await Effect.runPromise(
      outboxWriter.write({
        eventName: "ProjectDeleted",
        aggregateType: "project",
        aggregateId: data.id,
        organizationId,
        payload: {
          organizationId,
          actorUserId: userId,
          projectId: data.id,
        },
      }),
    )
  })

export interface ProjectStats {
  readonly activeIssueCount: number
  readonly datasetCount: number
  readonly traceCount: number
}

export const getProjectStats = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<ProjectStats> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const datasetEffect = Effect.gen(function* () {
      const repo = yield* DatasetRepository
      const result = yield* repo.listByProject({
        projectId,
        options: { limit: 1000 },
      })
      return result.datasets.length
    }).pipe(
      withPostgres(DatasetRepositoryLive, pgClient, orgId),
      withTracing,
      Effect.tapError((error) => Effect.sync(() => logger.error({ error, operation: "countDatasets" }))),
      Effect.orElseSucceed(() => 0),
    )

    const traceEffect = Effect.gen(function* () {
      const repo = yield* TraceRepository
      return yield* repo.countByProjectId({
        organizationId: orgId,
        projectId,
      })
    }).pipe(
      withClickHouse(TraceRepositoryLive, chClient, orgId),
      withAi(AIEmbedLive, getRedisClient()),
      withTracing,
      Effect.tapError((error) => Effect.sync(() => logger.error({ error, operation: "countTraces" }))),
      Effect.orElseSucceed(() => 0),
    )

    const issueEffect = Effect.gen(function* () {
      const issues = yield* listIssuesUseCase({
        organizationId,
        projectId: data.projectId,
        lifecycleGroup: "active",
        limit: 1,
        offset: 0,
      })

      return issues.totalCount
    }).pipe(
      withPostgres(Layer.mergeAll(IssueRepositoryLive, EvaluationRepositoryLive), pgClient, orgId),
      withClickHouse(ScoreAnalyticsRepositoryLive, chClient, orgId),
      Effect.provide(
        Layer.succeed(IssueProjectionRepository, {
          upsert: () => Effect.void,
          delete: () => Effect.void,
          hybridSearch: () => Effect.succeed([]),
        }),
      ),
      withTracing,
      Effect.tapError((error) => Effect.sync(() => logger.error({ error, operation: "countActiveIssues" }))),
      Effect.orElseSucceed(() => 0),
    )

    const [activeIssueCount, datasetCount, traceCount] = await Effect.runPromise(
      Effect.all([issueEffect, datasetEffect, traceEffect]),
    )

    return { activeIssueCount, datasetCount, traceCount }
  })
