import { DatasetRepository } from "@domain/datasets"
import type { Project } from "@domain/projects"
import { createProjectUseCase, ProjectRepository, updateProjectUseCase } from "@domain/projects"
import { isValidId, OrganizationId, ProjectId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { DatasetRepositoryLive, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"

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
      return yield* repo.findAll()
    }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
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
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
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
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      createProjectUseCase({
        ...(data.id ? { id: ProjectId(data.id) } : {}),
        name: data.name,
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
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
      name: z.string().optional(),
      settings: projectSettingsSchema.optional(),
    }),
  )
  .handler(async ({ data }): Promise<ProjectRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      updateProjectUseCase({ id: ProjectId(data.id), name: data.name, settings: data.settings }).pipe(
        withPostgres(ProjectRepositoryLive, client, organizationId),
      ),
    )

    return toRecord(project)
  })

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.softDelete(ProjectId(data.id))
      }).pipe(withPostgres(ProjectRepositoryLive, client, organizationId)),
    )
  })

export interface ProjectStats {
  readonly datasetCount: number
  readonly tracesLast7Days: number
}

export const getProjectStats = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<ProjectStats> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const pgClient = getPostgresClient()
    const chClient = getClickhouseClient()

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 19)

    const datasetEffect = Effect.gen(function* () {
      const repo = yield* DatasetRepository
      const result = yield* repo.listByProject({
        projectId,
        options: { limit: 1000 },
      })
      return result.datasets.length
    }).pipe(
      withPostgres(DatasetRepositoryLive, pgClient, orgId),
      Effect.tapError((error) => Effect.sync(() => logger.error({ error, operation: "countDatasets" }))),
      Effect.orElseSucceed(() => 0),
    )

    const traceEffect = Effect.gen(function* () {
      const repo = yield* TraceRepository
      return yield* repo.countByProjectId({
        organizationId: orgId,
        projectId,
        filters: {
          startTime: [{ op: "gte", value: sevenDaysAgoStr }],
        },
      })
    }).pipe(
      withClickHouse(TraceRepositoryLive, chClient, orgId),
      Effect.tapError((error) => Effect.sync(() => logger.error({ error, operation: "countTraces" }))),
      Effect.orElseSucceed(() => 0),
    )

    const [datasetCount, tracesLast7Days] = await Effect.runPromise(Effect.all([datasetEffect, traceEffect]))

    return { datasetCount, tracesLast7Days }
  })
