import {
  type ApiKey,
  ApiKeyRepository,
  generateApiKeyUseCase,
  revokeApiKeyUseCase,
  updateApiKeyUseCase,
} from "@domain/api-keys"
import { ProjectRepository } from "@domain/projects"
import { ApiKeyId, isValidId, ProjectId } from "@domain/shared"
import { ApiKeyCacheInvalidatorLive } from "@platform/api-key-auth"
import { ApiKeyRepositoryLive, OutboxEventWriterLive, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"

export interface ApiKeyRecord {
  readonly id: string
  readonly organizationId: string
  readonly name: string
  /** `null` is an organization-wide key. */
  readonly projectId: string | null
  readonly projectSlug: string | null
  readonly token: string
  readonly lastUsedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

const toRecord = (apiKey: ApiKey, projectSlug: string | null): ApiKeyRecord => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  name: apiKey.name,
  projectId: apiKey.projectId,
  projectSlug,
  token: apiKey.token,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString(),
})

const slugFor = (apiKey: ApiKey) =>
  Effect.gen(function* () {
    if (!apiKey.projectId) return null
    const projects = yield* ProjectRepository
    const project = yield* projects
      .findById(apiKey.projectId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    return project?.slug ?? null
  })

export const listApiKeys = createServerFn({ method: "GET" }).handler(async (): Promise<ApiKeyRecord[]> => {
  const { organizationId } = await requireSession()
  const client = getPostgresClient()

  const apiKeys = await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ApiKeyRepository
      const projects = yield* ProjectRepository
      const keys = yield* repo.list()
      const slugById = new Map((yield* projects.list()).map((project) => [project.id as string, project.slug]))
      return keys.map((apiKey) => toRecord(apiKey, apiKey.projectId ? (slugById.get(apiKey.projectId) ?? null) : null))
    }).pipe(
      withPostgres(Layer.mergeAll(ApiKeyRepositoryLive, ProjectRepositoryLive), client, organizationId),
      withTracing,
    ),
  )

  return apiKeys
})

export const createApiKey = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z
        .string()
        .optional()
        .refine((value) => value === undefined || isValidId(value), {
          message: "Invalid API key id",
        }),
      name: z.string().min(1).max(256),
      projectId: z.string().optional(),
    }),
  )
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()

    const apiKey = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* generateApiKeyUseCase({
          ...(data.id ? { id: ApiKeyId(data.id) } : {}),
          name: data.name,
          isSandbox: false,
          actorUserId: userId,
          ...(data.projectId ? { projectId: ProjectId(data.projectId) } : {}),
        })
        const projectSlug = yield* slugFor(created)
        return toRecord(created, projectSlug)
      }).pipe(
        withPostgres(
          Layer.mergeAll(ApiKeyRepositoryLive, OutboxEventWriterLive, ProjectRepositoryLive),
          client,
          organizationId,
        ),
        withTracing,
      ),
    )

    return apiKey
  })

export const updateApiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const apiKey = await Effect.runPromise(
      Effect.gen(function* () {
        const updated = yield* updateApiKeyUseCase({ id: ApiKeyId(data.id), name: data.name })
        const projectSlug = yield* slugFor(updated)
        return toRecord(updated, projectSlug)
      }).pipe(
        withPostgres(Layer.mergeAll(ApiKeyRepositoryLive, ProjectRepositoryLive), client, organizationId),
        withTracing,
      ),
    )

    return apiKey
  })

export const deleteApiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const redis = getRedisClient()

    await Effect.runPromise(
      revokeApiKeyUseCase({ id: ApiKeyId(data.id) }).pipe(
        Effect.provide(ApiKeyCacheInvalidatorLive(redis)),
        withPostgres(ApiKeyRepositoryLive, client, organizationId),
        withTracing,
      ),
    )
  })
