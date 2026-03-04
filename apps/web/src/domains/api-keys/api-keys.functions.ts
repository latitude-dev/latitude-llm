import { ApiKeyRepository, generateApiKeyUseCase, updateApiKeyUseCase } from "@domain/api-keys"
import type { ApiKey } from "@domain/api-keys"
import { ApiKeyId, OrganizationId } from "@domain/shared"
import { createApiKeyPostgresRepository, runCommand } from "@platform/db-postgres"
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
    const { db } = getPostgresClient()

    const apiKeys = await runCommand(
      db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ApiKeyRepository
          return yield* repo.findAll()
        }).pipe(Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb))),
      ),
    )

    return apiKeys.map(toRecord)
  })

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const apiKey = await runCommand(
      db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        generateApiKeyUseCase({
          organizationId: OrganizationId(organizationId),
          name: data.name,
        }).pipe(Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb))),
      ),
    )

    return toRecord(apiKey)
  })

export const updateApiKey = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ id: z.string(), name: z.string().min(1).max(256) }))
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const apiKey = await runCommand(
      db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        updateApiKeyUseCase({
          id: ApiKeyId(data.id),
          name: data.name,
        }).pipe(Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb))),
      ),
    )

    return toRecord(apiKey)
  })

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    await runCommand(
      db,
      organizationId,
    )(async (txDb) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* ApiKeyRepository
          return yield* repo.delete(ApiKeyId(data.id))
        }).pipe(Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb))),
      ),
    )
  })
