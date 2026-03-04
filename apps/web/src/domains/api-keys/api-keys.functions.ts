import { generateApiKeyUseCase, updateApiKeyUseCase } from "@domain/api-keys"
import type { ApiKey } from "@domain/api-keys"
import { ApiKeyId, OrganizationId, generateId } from "@domain/shared"
import { createApiKeyPostgresRepository, runCommand } from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

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
  .inputValidator(zodValidator(z.object({})))
  .handler(async (): Promise<ApiKeyRecord[]> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const apiKeys = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const apiKeysRepo = createApiKeyPostgresRepository(txDb, OrganizationId(organizationId))
      return Effect.runPromise(apiKeysRepo.findAll())
    })

    return apiKeys.map(toRecord)
  })

export const createApiKey = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(z.object({ name: z.string().min(1).max(256) })))
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const apiKey = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const apiKeysRepo = createApiKeyPostgresRepository(txDb, OrganizationId(organizationId))

      return Effect.runPromise(
        generateApiKeyUseCase(apiKeysRepo)({
          id: ApiKeyId(generateId()),
          organizationId: OrganizationId(organizationId),
          name: data.name,
        }),
      )
    })

    return toRecord(apiKey)
  })

export const updateApiKey = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(z.object({ id: z.string(), name: z.string().min(1).max(256) })))
  .handler(async ({ data }): Promise<ApiKeyRecord> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    const apiKey = await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const apiKeysRepo = createApiKeyPostgresRepository(txDb, OrganizationId(organizationId))

      return Effect.runPromise(
        updateApiKeyUseCase(apiKeysRepo)({
          id: ApiKeyId(data.id),
          name: data.name,
        }),
      )
    })

    return toRecord(apiKey)
  })

export const deleteApiKey = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(z.object({ id: z.string() })))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireSession()
    const { db } = getPostgresClient()

    await runCommand(
      db,
      organizationId,
    )(async (txDb) => {
      const apiKeysRepo = createApiKeyPostgresRepository(txDb, OrganizationId(organizationId))
      return Effect.runPromise(apiKeysRepo.delete(ApiKeyId(data.id)))
    })
  })
