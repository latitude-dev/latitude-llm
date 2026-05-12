import { DatasetRepository } from "@domain/datasets"
import { listIssuesUseCase } from "@domain/issues"
import type { Project } from "@domain/projects"
import { createProjectUseCase, ProjectRepository, updateProjectUseCase } from "@domain/projects"
import { isValidId, OrganizationId, ProjectId, projectSettingsSchema } from "@domain/shared"
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
  SqlClientLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { setCookie } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getOutboxWriter, getPostgresClient, getRedisClient } from "../../server/clients.ts"

export const LAST_PROJECT_COOKIE_NAME = "latitude-last-project-slug"
const LAST_PROJECT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
const logger = createLogger("project-stats")

// Persist the currently visited slug so `/_authenticated/` can redirect back
// to it. Called from the project layout's mount effect — using a server fn
// (rather than a loader side-effect) keeps the cookie in sync even when the
// route's `staleTime: Infinity` serves a cached loader on revisits.
export const rememberLastProjectSlug = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }): Promise<void> => {
    setCookie(LAST_PROJECT_COOKIE_NAME, data.slug, {
      path: "/",
      sameSite: "lax",
      maxAge: LAST_PROJECT_COOKIE_MAX_AGE_SECONDS,
    })
  })

export const toRecord = (project: Project) => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  settings: {
    keepMonitoring: project.settings?.keepMonitoring,
    notifications: project.settings?.notifications,
    escalation: project.settings?.escalation,
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
      outboxWriter
        .write({
          eventName: "ProjectDeleted",
          aggregateType: "project",
          aggregateId: data.id,
          organizationId,
          payload: {
            organizationId,
            actorUserId: userId,
            projectId: data.id,
          },
        })
        .pipe(Effect.provide(SqlClientLive(client, organizationId)), withTracing),
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
      withTracing,
      Effect.tapError((error) => Effect.sync(() => logger.error({ error, operation: "countActiveIssues" }))),
      Effect.orElseSucceed(() => 0),
    )

    const [activeIssueCount, datasetCount, traceCount] = await Effect.runPromise(
      Effect.all([issueEffect, datasetEffect, traceEffect]).pipe(withTracing),
    )

    return { activeIssueCount, datasetCount, traceCount }
  })
