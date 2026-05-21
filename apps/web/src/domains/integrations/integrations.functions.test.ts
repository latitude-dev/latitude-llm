import {
  type SlackIntegration,
  SlackIntegrationRepository,
  type SlackIntegrationRepositoryShape,
} from "@domain/integrations"
import { InMemorySlackIntegrationRepositoryLive } from "@domain/integrations/testing"
import { generateId, OrganizationId, SlackIntegrationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { Effect, Exit, Layer } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock @platform/slack so the WebClient inside `auth.revoke` never
// makes a real network call. Each test sets `revokeMock`'s behaviour
// (resolve / reject) before driving the Effect.
const { revokeMock } = vi.hoisted(() => ({ revokeMock: vi.fn() }))

vi.mock("@platform/slack", async (importActual) => {
  const actual = await importActual<typeof import("@platform/slack")>()
  return {
    ...actual,
    createSlackClient: () => ({
      auth: { revoke: revokeMock },
    }),
  }
})

const { disconnectSlackIntegrationEffect } = await import("./integrations.functions.ts")

const ORG_A = OrganizationId("a".repeat(24))
const INSTALLER = UserId("u".repeat(24))

// Stub SqlClient — disconnect runs through the in-memory fake, which
// does not hit the DB, but the port leaks `SqlClient` so we must
// satisfy the requirement. Same pattern as the install use-case test.
const NoopSqlClient = Layer.succeed(SqlClient, {
  organizationId: ORG_A,
  transaction: (effect: Effect.Effect<unknown, unknown, unknown>) => effect,
  query: () => {
    throw new Error("NoopSqlClient.query was called — the in-memory fake should not need it")
  },
} as unknown as SqlClientShape)

const makeIntegration = (overrides: Partial<SlackIntegration> = {}): SlackIntegration => {
  const now = new Date()
  return {
    id: SlackIntegrationId(generateId()),
    organizationId: ORG_A,
    teamId: "T01ACME",
    teamName: "Acme Inc.",
    appId: "A01APP",
    botUserId: "U01BOT",
    botAccessToken: "xoxb-test",
    botTokenScopes: "chat:write,team:read",
    refreshToken: null,
    tokenExpiresAt: null,
    installedByUserId: INSTALLER,
    installedAt: now,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const runWith = (layers: { readonly repo: ReturnType<typeof InMemorySlackIntegrationRepositoryLive> }) =>
  disconnectSlackIntegrationEffect.pipe(Effect.provide(layers.repo), Effect.provide(NoopSqlClient))

const findActive = async (repoLayer: ReturnType<typeof InMemorySlackIntegrationRepositoryLive>) => {
  const effect = Effect.gen(function* () {
    const repo: SlackIntegrationRepositoryShape = yield* SlackIntegrationRepository
    return yield* repo.findActiveByOrganizationId()
  })
  return Effect.runPromise(effect.pipe(Effect.provide(repoLayer), Effect.provide(NoopSqlClient)))
}

describe("disconnectSlackIntegrationEffect", () => {
  beforeEach(() => {
    revokeMock.mockReset()
  })

  afterEach(() => {
    revokeMock.mockReset()
  })

  it("returns { revoked: false } when no active integration exists", async () => {
    const repoLayer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG_A })

    const result = await Effect.runPromise(runWith({ repo: repoLayer }))

    expect(result).toEqual({ revoked: false })
    expect(revokeMock).not.toHaveBeenCalled()
  })

  it("soft-revokes the active integration and calls Slack auth.revoke", async () => {
    revokeMock.mockResolvedValue({ ok: true })
    const seed = makeIntegration()
    const repoLayer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG_A, seed: [seed] })

    const result = await Effect.runPromise(runWith({ repo: repoLayer }))

    expect(result).toEqual({ revoked: true })
    expect(revokeMock).toHaveBeenCalledTimes(1)
    const stillActive = await findActive(repoLayer)
    expect(stillActive).toBeNull()
  })

  it("still reports revoked=true when Slack auth.revoke fails (best-effort)", async () => {
    revokeMock.mockRejectedValue(new Error("slack API blew up"))
    const seed = makeIntegration()
    const repoLayer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG_A, seed: [seed] })

    const exit = await Effect.runPromiseExit(runWith({ repo: repoLayer }))

    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toEqual({ revoked: true })
    }
    // Local row is revoked even though Slack-side failed.
    const stillActive = await findActive(repoLayer)
    expect(stillActive).toBeNull()
  })
})
