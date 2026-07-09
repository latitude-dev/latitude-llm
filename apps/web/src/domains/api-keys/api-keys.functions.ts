import {
  type ApiKey,
  ApiKeyRepository,
  generateApiKeyUseCase,
  maskApiKeyToken,
  revokeApiKeyUseCase,
  updateApiKeyUseCase,
} from "@domain/api-keys"
import { MembershipRepository } from "@domain/organizations"
import { ApiKeyId, ForbiddenError, isValidId } from "@domain/shared"
import { ApiKeyCacheInvalidatorLive } from "@platform/api-key-auth"
import {
  ApiKeyRepositoryLive,
  MembershipRepositoryLive,
  OutboxEventWriterLive,
  withPostgres,
} from "@platform/db-postgres"
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
  readonly token: string
  readonly lastUsedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

const toRecord = (apiKey: ApiKey, options: { readonly maskToken: boolean }): ApiKeyRecord => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  name: apiKey.name,
  token: options.maskToken ? maskApiKeyToken(apiKey.token) : apiKey.token,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString(),
})

const requireApiKeyAdmin = async () => {
  const session = await requireSession()
  const client = getPostgresClient()
  const isAdmin = await Effect.runPromise(
    Effect.gen(function* () {
      const memberships = yield* MembershipRepository
      return yield* memberships.isAdmin(session.organizationId, session.userId)
    }).pipe(withPostgres(MembershipRepositoryLive, client, session.organizationId), withTracing),
  )
  if (!isAdmin) {
    throw new ForbiddenError({ message: "Only organization owners and admins can manage API keys" })
  }
  return { ...session, client }
}

export const listApiKeys = createServerFn({ method: "GET" }).handler(async (): Promise<ApiKeyRecord[]> => {
  const { organizationId, client } = await requireApiKeyAdmin()

  const apiKeys = await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ApiKeyRepository
      return yield* repo.list()
    }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId), withTracing),
  )

  return apiKeys.map((apiKey) => toRecord(apiKey, { maskToken: true }))
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
    }),
  )
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId, userId, client } = await requireApiKeyAdmin()

    const apiKey = await Effect.runPromise(
      generateApiKeyUseCase({
        ...(data.id ? { id: ApiKeyId(data.id) } : {}),
        name: data.name,
        isSandbox: false,
        actorUserId: userId,
      }).pipe(
        withPostgres(Layer.mergeAll(ApiKeyRepositoryLive, OutboxEventWriterLive), client, organizationId),
        withTracing,
      ),
    )

    return toRecord(apiKey, { maskToken: false })
  })

export const updateApiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId, client } = await requireApiKeyAdmin()

    const apiKey = await Effect.runPromise(
      updateApiKeyUseCase({ id: ApiKeyId(data.id), name: data.name }).pipe(
        withPostgres(ApiKeyRepositoryLive, client, organizationId),
        withTracing,
      ),
    )

    return toRecord(apiKey, { maskToken: true })
  })

export const deleteApiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId, client } = await requireApiKeyAdmin()
    const redis = getRedisClient()

    await Effect.runPromise(
      revokeApiKeyUseCase({ id: ApiKeyId(data.id) }).pipe(
        Effect.provide(ApiKeyCacheInvalidatorLive(redis)),
        withPostgres(ApiKeyRepositoryLive, client, organizationId),
        withTracing,
      ),
    )
  })
