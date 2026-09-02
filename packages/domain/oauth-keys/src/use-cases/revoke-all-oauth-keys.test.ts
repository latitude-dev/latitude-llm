import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { OAuthKey } from "../entities/oauth-key.ts"
import { OAuthKeyRepository, OAuthTokenCacheInvalidator } from "../ports/oauth-key-repository.ts"
import { revokeAllOAuthKeysUseCase } from "./revoke-all-oauth-keys.ts"

type OAuthKeyRepositoryShape = (typeof OAuthKeyRepository)["Service"]

interface TokenRow {
  readonly clientId: string
  readonly userId: string
  readonly accessToken: string
}

const sqlClient: SqlClientShape = {
  organizationId: OrganizationId("oooooooooooooooooooooooo"),
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const createFakeOAuthKeyRepository = (seed: readonly TokenRow[]) => {
  let tokens = [...seed]
  const clientIds = new Set(seed.map((token) => token.clientId))
  const disabledClientIds = new Set<string>()

  const toOAuthKey = (clientId: string, userId: string): OAuthKey => ({
    id: `${clientId}:${userId}`,
    clientId,
    clientName: null,
    clientIcon: null,
    userId,
    userName: null,
    userEmail: `${userId}@example.com`,
    lastActivityAt: null,
    connectedAt: new Date(0),
    disabled: disabledClientIds.has(clientId),
  })

  const listPairs = (): OAuthKey[] => {
    const pairs = new Map<string, OAuthKey>()
    for (const token of tokens) pairs.set(`${token.clientId}:${token.userId}`, toOAuthKey(token.clientId, token.userId))
    return [...pairs.values()]
  }

  const repository: OAuthKeyRepositoryShape = {
    listForOrganization: () => Effect.sync(listPairs),
    findByPair: ({ clientId, userId }) =>
      Effect.sync(() => listPairs().find((key) => key.clientId === clientId && key.userId === userId) ?? null),
    applicationBelongsToOrganization: (clientId) => Effect.succeed(clientIds.has(clientId)),
    deleteTokensForPair: ({ clientId, userId }) =>
      Effect.sync(() => {
        const removed = tokens.filter((token) => token.clientId === clientId && token.userId === userId)
        tokens = tokens.filter((token) => !removed.includes(token))
        return removed.map((token) => token.accessToken)
      }),
    hasRemainingTokensForApplication: (clientId) =>
      Effect.sync(() => tokens.some((token) => token.clientId === clientId)),
    markApplicationDisabled: (clientId) =>
      Effect.sync(() => {
        disabledClientIds.add(clientId)
      }),
  }

  return { repository, remainingTokens: () => tokens, disabledClientIds }
}

describe("revokeAllOAuthKeysUseCase", () => {
  it("deletes every token of every pair, busts each cached validation, and disables the applications", async () => {
    const fake = createFakeOAuthKeyRepository([
      { clientId: "client-a", userId: "user-1", accessToken: "a1-first" },
      { clientId: "client-a", userId: "user-1", accessToken: "a1-refreshed" },
      { clientId: "client-a", userId: "user-2", accessToken: "a2" },
      { clientId: "client-b", userId: "user-1", accessToken: "b1" },
    ])
    const invalidated: string[] = []

    const revoked = await Effect.runPromise(
      revokeAllOAuthKeysUseCase().pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(OAuthKeyRepository, fake.repository),
        Effect.provideService(OAuthTokenCacheInvalidator, {
          invalidate: (accessToken) =>
            Effect.sync(() => {
              invalidated.push(accessToken)
            }),
        }),
      ),
    )

    expect(revoked.map((key) => key.id).sort()).toEqual(["client-a:user-1", "client-a:user-2", "client-b:user-1"])
    expect(fake.remainingTokens()).toEqual([])
    expect(invalidated.sort()).toEqual(["a1-first", "a1-refreshed", "a2", "b1"])
    expect([...fake.disabledClientIds].sort()).toEqual(["client-a", "client-b"])
  })

  it("is a no-op for an organization without OAuth keys", async () => {
    const fake = createFakeOAuthKeyRepository([])
    const invalidated: string[] = []

    const revoked = await Effect.runPromise(
      revokeAllOAuthKeysUseCase().pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(OAuthKeyRepository, fake.repository),
        Effect.provideService(OAuthTokenCacheInvalidator, {
          invalidate: (accessToken) =>
            Effect.sync(() => {
              invalidated.push(accessToken)
            }),
        }),
      ),
    )

    expect(revoked).toEqual([])
    expect(invalidated).toEqual([])
    expect(fake.disabledClientIds.size).toBe(0)
  })
})
