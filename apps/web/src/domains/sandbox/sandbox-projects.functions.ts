import type { Project } from "@domain/projects"
import { createProjectUseCase, ProjectRepository } from "@domain/projects"
import { organizationIdSchema, ProjectId, projectIdSchema } from "@domain/shared"
import { OutboxEventWriterLive, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getPostgresClient } from "../../server/clients.ts"
import { sandboxMiddleware } from "../../server/sandbox-middleware.ts"

/**
 * Project ops scoped to a single sandbox org. All run behind `sandboxMiddleware`,
 * which authorizes the caller (member of the sandbox's parent org) and hands the
 * handler `context.sandbox` — the *only* org reachable here — so reads/writes
 * can never leak onto the live parent. Project rows are ordinary RLS-scoped data,
 * so a normal connection scoped to the sandbox org (not the admin client) is
 * correct, exactly as the spec's `withPostgres(layer, client, sandboxOrgId)`.
 */

interface SandboxProjectRecord {
  readonly id: string
  readonly organizationId: string
  readonly name: string
  readonly slug: string
  /** Set when this sandbox project was created from a production project (its stable id). */
  readonly linkedProjectId: string | null
  readonly firstTraceAt: string | null
  readonly createdAt: string
}

const toSandboxProjectRecord = (project: Project): SandboxProjectRecord => ({
  id: project.id,
  organizationId: project.organizationId,
  name: project.name,
  slug: project.slug,
  linkedProjectId: project.linkedProjectId,
  firstTraceAt: project.firstTraceAt ? project.firstTraceAt.toISOString() : null,
  createdAt: project.createdAt.toISOString(),
})

const sandboxProjectWriteLayers = Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive)

/** Projects that live inside the sandbox (linked + sandbox-only). */
export const listSandboxProjects = createServerFn({ method: "GET" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema }))
  .handler(async ({ context }): Promise<readonly SandboxProjectRecord[]> => {
    const client = getPostgresClient()
    const projects = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.list()
      }).pipe(withPostgres(ProjectRepositoryLive, client, context.sandbox.organizationId), withTracing),
    )
    return projects.map(toSandboxProjectRecord)
  })

interface AttachableParentProjectDto {
  readonly id: string
  readonly name: string
  readonly slug: string
  /** True when a sandbox project already links to this production project. */
  readonly alreadyAttached: boolean
}

/**
 * The parent org's projects, each flagged with whether it's already attached to
 * this sandbox — the source list for the "add a production project" picker. The
 * parent read is an ordinary scoped read (the caller is a member of the parent).
 */
export const listAttachableParentProjects = createServerFn({ method: "GET" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema }))
  .handler(async ({ context }): Promise<readonly AttachableParentProjectDto[]> => {
    const client = getPostgresClient()

    const [parentProjects, sandboxProjects] = await Promise.all([
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ProjectRepository
          return yield* repo.list()
        }).pipe(withPostgres(ProjectRepositoryLive, client, context.sandbox.parentOrgId), withTracing),
      ),
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ProjectRepository
          return yield* repo.list()
        }).pipe(withPostgres(ProjectRepositoryLive, client, context.sandbox.organizationId), withTracing),
      ),
    ])

    const linkedIds = new Set(
      sandboxProjects.map((p) => p.linkedProjectId).filter((id): id is NonNullable<typeof id> => id !== null),
    )

    return parentProjects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      alreadyAttached: linkedIds.has(project.id),
    }))
  })

/**
 * Attach a production project: create a sandbox project linked to that
 * production project's stable id (the durable key). The sandbox project takes
 * the production project's name but gets its own slug in the sandbox namespace.
 */
export const addProductionProjectToSandbox = createServerFn({ method: "POST" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema, productionProjectId: projectIdSchema }))
  .handler(async ({ context, data }): Promise<SandboxProjectRecord> => {
    const client = getPostgresClient()

    const parentProject = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        return yield* repo.findById(ProjectId(data.productionProjectId))
      }).pipe(withPostgres(ProjectRepositoryLive, client, context.sandbox.parentOrgId), withTracing),
    )

    const project = await Effect.runPromise(
      createProjectUseCase({
        name: parentProject.name,
        actorUserId: context.userId,
        linkedProjectId: ProjectId(data.productionProjectId),
      }).pipe(withPostgres(sandboxProjectWriteLayers, client, context.sandbox.organizationId), withTracing),
    )

    return toSandboxProjectRecord(project)
  })

/** Create a project that exists only inside the sandbox (`linkedProjectId` null). */
export const createSandboxOnlyProject = createServerFn({ method: "POST" })
  .middleware([sandboxMiddleware])
  .inputValidator(z.object({ sandboxOrgId: organizationIdSchema, name: z.string().min(1).max(256) }))
  .handler(async ({ context, data }): Promise<SandboxProjectRecord> => {
    const client = getPostgresClient()

    const project = await Effect.runPromise(
      createProjectUseCase({
        name: data.name,
        actorUserId: context.userId,
      }).pipe(withPostgres(sandboxProjectWriteLayers, client, context.sandbox.organizationId), withTracing),
    )

    return toSandboxProjectRecord(project)
  })
