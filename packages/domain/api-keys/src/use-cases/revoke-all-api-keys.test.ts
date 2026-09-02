import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createApiKey, isActive } from "../entities/api-key.ts"
import { ApiKeyRepository } from "../ports/api-key-repository.ts"
import { createFakeApiKeyRepository } from "../testing/index.ts"
import { revokeAllApiKeysUseCase } from "./revoke-all-api-keys.ts"
import { ApiKeyCacheInvalidator } from "./revoke-api-key.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")

const sqlClient: SqlClientShape = {
  organizationId: ORG_ID,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const seedApiKey = (name: string, deletedAt: Date | null = null) =>
  createApiKey({ organizationId: ORG_ID, token: `tok_${name}`, tokenHash: `hash_${name}`, name, deletedAt })

describe("revokeAllApiKeysUseCase", () => {
  it("revokes every active key and busts each cached validation", async () => {
    const { repository, apiKeys } = createFakeApiKeyRepository()
    const first = seedApiKey("first")
    const second = seedApiKey("second")
    const alreadyRevoked = seedApiKey("old", new Date("2026-01-01T00:00:00Z"))
    for (const apiKey of [first, second, alreadyRevoked]) apiKeys.set(apiKey.id, apiKey)
    const invalidated: string[] = []

    const revoked = await Effect.runPromise(
      revokeAllApiKeysUseCase().pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(ApiKeyRepository, repository),
        Effect.provideService(ApiKeyCacheInvalidator, {
          delete: (tokenHash) =>
            Effect.sync(() => {
              invalidated.push(tokenHash)
            }),
        }),
      ),
    )

    expect(revoked.map((apiKey) => apiKey.id).sort()).toEqual([first.id, second.id].sort())
    expect([...apiKeys.values()].filter(isActive)).toEqual([])
    expect(invalidated.sort()).toEqual(["hash_first", "hash_second"])
  })

  it("is a no-op for an organization without active keys", async () => {
    const { repository } = createFakeApiKeyRepository()
    const invalidated: string[] = []

    const revoked = await Effect.runPromise(
      revokeAllApiKeysUseCase().pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(ApiKeyRepository, repository),
        Effect.provideService(ApiKeyCacheInvalidator, {
          delete: (tokenHash) =>
            Effect.sync(() => {
              invalidated.push(tokenHash)
            }),
        }),
      ),
    )

    expect(revoked).toEqual([])
    expect(invalidated).toEqual([])
  })
})
