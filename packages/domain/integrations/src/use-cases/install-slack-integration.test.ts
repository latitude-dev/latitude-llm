import { generateId, OrganizationId, SlackIntegrationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SlackIntegration } from "../entities/slack-integration.ts"
import { SlackIntegrationConflictError } from "../errors.ts"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"
import { InMemorySlackIntegrationRepositoryLive } from "../testing/in-memory-slack-integration-repository.ts"
import { installSlackIntegrationUseCase } from "./install-slack-integration.ts"

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const INSTALLER = UserId("u".repeat(24))

// The in-memory fake doesn't touch a real DB, but the install use case
// wraps its body in `sqlClient.transaction(...)` so the parent +
// details rows would be atomic at the live adapter. Here `transaction`
// is a pass-through that runs its effect inline — the fake's
// invariants are enforced in-memory, not via SQL — and `query` stays
// an unreachable stub so accidental use is loud.
const NoopSqlClient = Layer.succeed(SqlClient, {
  organizationId: ORG_A,
  transaction: (effect: Effect.Effect<unknown, unknown, unknown>) => effect,
  query: () => {
    throw new Error("NoopSqlClient.query was called — the in-memory fake should not need it")
  },
} as unknown as SqlClientShape)

const baseInput = (overrides: Partial<Parameters<typeof installSlackIntegrationUseCase>[0]> = {}) => ({
  organizationId: ORG_A,
  teamId: "T01ACME",
  teamName: "Acme Inc.",
  appId: "A01APP",
  botUserId: "U01BOT",
  botAccessToken: "xoxb-fresh",
  botTokenScopes: "chat:write,team:read",
  refreshToken: null,
  tokenExpiresAt: null,
  installedByUserId: INSTALLER,
  ...overrides,
})

const seedExisting = (overrides: Partial<SlackIntegration> = {}): SlackIntegration => {
  const now = new Date()
  return {
    id: SlackIntegrationId(generateId()),
    organizationId: ORG_A,
    teamId: "T01ACME",
    teamName: "Acme Inc.",
    appId: "A01APP",
    botUserId: "U01BOT",
    botAccessToken: "xoxb-prior",
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

describe("installSlackIntegrationUseCase", () => {
  it("inserts a fresh integration when no prior install exists", async () => {
    const repoLayer = InMemorySlackIntegrationRepositoryLive({ organizationId: ORG_A })

    const integration = await Effect.runPromise(
      installSlackIntegrationUseCase(baseInput()).pipe(Effect.provide(repoLayer), Effect.provide(NoopSqlClient)),
    )

    expect(integration.teamId).toBe("T01ACME")
    expect(integration.organizationId).toBe(ORG_A)
    expect(integration.revokedAt).toBeNull()
  })

  it("soft-revokes the existing active integration when reinstalling in the same org", async () => {
    const prior = seedExisting()
    const repoLayer = InMemorySlackIntegrationRepositoryLive({
      organizationId: ORG_A,
      seed: [prior],
    })

    const fresh = await Effect.runPromise(
      installSlackIntegrationUseCase(baseInput({ botAccessToken: "xoxb-new" })).pipe(
        Effect.provide(repoLayer),
        Effect.provide(NoopSqlClient),
      ),
    )

    expect(fresh.id).not.toBe(prior.id)
    expect(fresh.botAccessToken).toBe("xoxb-new")

    const stillActive = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(Effect.provide(repoLayer), Effect.provide(NoopSqlClient)),
    )

    expect(stillActive?.id).toBe(fresh.id)
  })

  it("fails with SlackIntegrationConflictError when the workspace is owned by another org", async () => {
    const otherOrgInstall = seedExisting({ organizationId: ORG_B })
    const repoLayer = InMemorySlackIntegrationRepositoryLive({
      organizationId: ORG_A,
      seed: [otherOrgInstall],
    })

    const exit = await Effect.runPromiseExit(
      installSlackIntegrationUseCase(baseInput()).pipe(Effect.provide(repoLayer), Effect.provide(NoopSqlClient)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failReason = exit.cause.reasons.find(Cause.isFailReason)
      expect(failReason?.error).toBeInstanceOf(SlackIntegrationConflictError)
    }
  })
})
