import { generateId, OrganizationId, SlackIntegrationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SlackIntegration } from "../entities/slack-integration.ts"
import { SlackTokenRefreshError } from "../errors.ts"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"
import { SlackRefreshLockRepository } from "../ports/slack-refresh-lock-repository.ts"
import { SlackTokenRefresher, type SlackTokenRefreshResult } from "../ports/slack-token-refresher.ts"
import { InMemorySlackIntegrationRepositoryLive } from "../testing/in-memory-slack-integration-repository.ts"
import { getOrRefreshBotTokenUseCase } from "./get-or-refresh-bot-token.ts"

const ORG = OrganizationId("o".repeat(24))

const NoopSqlClient = Layer.succeed(SqlClient, {
  organizationId: ORG,
  transaction: (effect: Effect.Effect<unknown, unknown, unknown>) => effect,
  query: () => {
    throw new Error("NoopSqlClient.query was called — the in-memory fake should not need it")
  },
} as unknown as SqlClientShape)

// Pass-through lock: runs the inner effect without contention. The
// single-flight behaviour itself is covered in the Redis adapter test.
const PassThroughLock = Layer.succeed(SlackRefreshLockRepository, {
  withRefreshLock: (_input, effect) => effect,
})

const makeFakeRefresher = (
  impl: (refreshToken: string) => Effect.Effect<SlackTokenRefreshResult, SlackTokenRefreshError>,
) => {
  const calls: string[] = []
  const layer = Layer.succeed(SlackTokenRefresher, {
    refresh: (refreshToken: string) => {
      calls.push(refreshToken)
      return impl(refreshToken)
    },
  })
  return { layer, calls }
}

const seedIntegration = (id: SlackIntegrationId, overrides: Partial<SlackIntegration> = {}): SlackIntegration => {
  const now = new Date()
  return {
    id,
    organizationId: ORG,
    teamId: "T01",
    teamName: "Acme",
    appId: "A01",
    botUserId: "U01",
    botAccessToken: "xoxe-current",
    botTokenScopes: "chat:write",
    refreshToken: "refresh-current",
    tokenExpiresAt: new Date(now.getTime() + 60 * 60_000),
    reconnectRequiredAt: null,
    installedByUserId: UserId("u".repeat(24)),
    installedAt: now,
    revokedAt: null,
    routes: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const run = <A, E>(
  integration: SlackIntegration,
  layer: ReturnType<typeof InMemorySlackIntegrationRepositoryLive>,
  refresher: Layer.Layer<SlackTokenRefresher>,
) =>
  Effect.runPromiseExit(
    getOrRefreshBotTokenUseCase({ integration }).pipe(
      Effect.provide(layer),
      Effect.provide(refresher),
      Effect.provide(PassThroughLock),
      Effect.provide(NoopSqlClient),
    ) as Effect.Effect<A, E>,
  )

const refreshOk = (botAccessToken: string, refreshToken: string): SlackTokenRefreshResult => ({
  botAccessToken,
  refreshToken,
  expiresIn: 43_200,
})

describe("getOrRefreshBotTokenUseCase", () => {
  it("returns the current token unchanged when rotation is disabled", async () => {
    const id = SlackIntegrationId(generateId())
    const integration = seedIntegration(id, {
      refreshToken: null,
      tokenExpiresAt: null,
      botAccessToken: "xoxb-longlived",
    })
    const layer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG, seed: [integration] })
    const { layer: refresher, calls } = makeFakeRefresher(() => Effect.die("should not refresh"))

    const exit = await run(integration, layer, refresher)

    expect(exit).toStrictEqual(Exit.succeed("xoxb-longlived"))
    expect(calls).toEqual([])
  })

  it("returns the current token when it is still comfortably fresh", async () => {
    const id = SlackIntegrationId(generateId())
    const integration = seedIntegration(id, {
      botAccessToken: "xoxe-fresh",
      tokenExpiresAt: new Date(Date.now() + 60 * 60_000), // 1h out, beyond 5m skew
    })
    const layer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG, seed: [integration] })
    const { layer: refresher, calls } = makeFakeRefresher(() => Effect.die("should not refresh"))

    const exit = await run(integration, layer, refresher)

    expect(exit).toStrictEqual(Exit.succeed("xoxe-fresh"))
    expect(calls).toEqual([])
  })

  it("refreshes and persists when the token is at/near expiry, clearing any reconnect flag", async () => {
    const id = SlackIntegrationId(generateId())
    const integration = seedIntegration(id, {
      botAccessToken: "xoxe-stale",
      refreshToken: "refresh-1",
      tokenExpiresAt: new Date(Date.now() + 60_000), // 60s out, inside 5m skew
      reconnectRequiredAt: new Date(Date.now() - 60_000), // a prior failure left this set
    })
    const layer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG, seed: [integration] })
    const { layer: refresher, calls } = makeFakeRefresher((rt) => {
      expect(rt).toBe("refresh-1")
      return Effect.succeed(refreshOk("xoxe-new", "refresh-2"))
    })

    const exit = await run(integration, layer, refresher)
    expect(exit).toStrictEqual(Exit.succeed("xoxe-new"))
    expect(calls).toEqual(["refresh-1"])

    // The rotated triple was persisted and the reconnect flag cleared.
    const stored = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(Effect.provide(layer), Effect.provide(NoopSqlClient)),
    )
    expect(stored?.botAccessToken).toBe("xoxe-new")
    expect(stored?.refreshToken).toBe("refresh-2")
    expect(stored?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 60_000)
    expect(stored?.reconnectRequiredAt).toBeNull()
  })

  it("skips the Slack call when a concurrent holder already refreshed (double-check)", async () => {
    const id = SlackIntegrationId(generateId())
    // Stored row is already fresh; the caller holds a stale snapshot.
    const stored = seedIntegration(id, {
      botAccessToken: "xoxe-already-fresh",
      tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
    })
    const staleInput = seedIntegration(id, {
      botAccessToken: "xoxe-stale",
      tokenExpiresAt: new Date(Date.now() + 60_000),
    })
    const layer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG, seed: [stored] })
    const { layer: refresher, calls } = makeFakeRefresher(() => Effect.die("should not refresh"))

    const exit = await run(staleInput, layer, refresher)

    expect(exit).toStrictEqual(Exit.succeed("xoxe-already-fresh"))
    expect(calls).toEqual([])
  })

  it("marks reconnect-required and propagates on invalid_refresh_token (broken chain)", async () => {
    const id = SlackIntegrationId(generateId())
    const integration = seedIntegration(id, {
      tokenExpiresAt: new Date(Date.now() + 60_000),
      refreshToken: "refresh-dead",
    })
    const layer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG, seed: [integration] })
    const { layer: refresher } = makeFakeRefresher(() =>
      Effect.fail(new SlackTokenRefreshError({ reason: "invalid_refresh_token" })),
    )

    const exit = await run<string, SlackTokenRefreshError>(integration, layer, refresher)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failReason = exit.cause.reasons.find(Cause.isFailReason)
      expect(failReason?.error).toBeInstanceOf(SlackTokenRefreshError)
      expect((failReason?.error as SlackTokenRefreshError).reason).toBe("invalid_refresh_token")
    }

    // The dead chain was stamped so the UI can prompt a reconnect.
    const stored = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(Effect.provide(layer), Effect.provide(NoopSqlClient)),
    )
    expect(stored?.reconnectRequiredAt).not.toBeNull()
  })

  it("returns the held token when the integration was revoked mid-flight", async () => {
    const id = SlackIntegrationId(generateId())
    const staleInput = seedIntegration(id, {
      botAccessToken: "xoxe-held",
      tokenExpiresAt: new Date(Date.now() + 60_000),
    })
    // Repo has no active row for this org.
    const layer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG })
    const { layer: refresher, calls } = makeFakeRefresher(() => Effect.die("should not refresh"))

    const exit = await run(staleInput, layer, refresher)

    expect(exit).toStrictEqual(Exit.succeed("xoxe-held"))
    expect(calls).toEqual([])
  })
})
