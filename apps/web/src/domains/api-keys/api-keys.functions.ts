import { type ApiKey, ApiKeyRepository, generateApiKeyUseCase, updateApiKeyUseCase } from "@domain/api-keys"
import { ApiKeyId, isValidId } from "@domain/shared"
import { ApiKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"

export interface ApiKeyRecord {
  readonly id: string
  readonly organizationId: string
  readonly name: string
  readonly token: string
  readonly lastUsedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

const toRecord = (apiKey: ApiKey): ApiKeyRecord => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  name: apiKey.name,
  token: apiKey.token,
  lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  createdAt: apiKey.createdAt.toISOString(),
  updatedAt: apiKey.updatedAt.toISOString(),
})

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([errorHandler])
  .handler(async (): Promise<ApiKeyRecord[]> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const apiKeys = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        return yield* repo.findAll()
      }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId)),
    )

    return apiKeys.map(toRecord)
  })

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([errorHandler])
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
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const apiKey = await Effect.runPromise(
      generateApiKeyUseCase({
        ...(data.id ? { id: ApiKeyId(data.id) } : {}),
        name: data.name,
      }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId)),
    )

    return toRecord(apiKey)
  })

export const updateApiKey = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ id: z.string(), name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const apiKey = await Effect.runPromise(
      updateApiKeyUseCase({ id: ApiKeyId(data.id), name: data.name }).pipe(
        withPostgres(ApiKeyRepositoryLive, client, organizationId),
      ),
    )

    return toRecord(apiKey)
  })

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ApiKeyRepository
        yield* repo.delete(ApiKeyId(data.id))
      }).pipe(withPostgres(ApiKeyRepositoryLive, client, organizationId)),
    )
  })
