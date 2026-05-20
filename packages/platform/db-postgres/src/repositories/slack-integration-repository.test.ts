import { type SlackIntegration, SlackIntegrationConflictError, SlackIntegrationRepository } from "@domain/slack"
import {
  generateId,
  OrganizationId,
  SlackIntegrationId,
  type SqlClient,
  UserId,
} from "@domain/shared"
import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { slackIntegrations } from "../schema/slack-integrations.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import {
  findActiveSlackIntegrationByTeamIdAcrossOrgs,
  SlackIntegrationRepositoryLive,
  softRevokeSlackIntegrationAcrossOrgs,
} from "./slack-integration-repository.ts"

// Same 32-byte hex key as .env.test for parity. Set on process.env so
// the repository's getEncryptionKey() resolves without ambient .env load.
beforeAll(() => {
  process.env.LAT_MASTER_ENCRYPTION_KEY =
    process.env.LAT_MASTER_ENCRYPTION_KEY ?? "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
})

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const INSTALLER = UserId("u".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(
  effect: Effect.Effect<A, E, SlackIntegrationRepository | SqlClient>,
  org: OrganizationId = ORG_A,
) => Effect.runPromise(effect.pipe(withPostgres(SlackIntegrationRepositoryLive, pg.adminPostgresClient, org)))

const makeIntegration = (overrides: Partial<SlackIntegration> = {}): SlackIntegration => {
  const now = new Date()
  return {
    id: SlackIntegrationId(generateId()),
    organizationId: ORG_A,
    teamId: "T01ACME",
    teamName: "Acme Inc.",
    appId: "A01APP",
    botUserId: "U01BOT",
    botAccessToken: "xoxb-secret-plaintext",
    botTokenScopes: "chat:write,chat:write.public,team:read",
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

afterEach(async () => {
  await pg.db.delete(slackIntegrations)
})

describe("SlackIntegrationRepositoryLive", () => {
  it("encrypts the bot token on insert and decrypts it back on read", async () => {
    const integration = makeIntegration({ botAccessToken: "xoxb-plaintext-secret" })

    const saved = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.save(integration)
      }),
    )

    expect(saved.botAccessToken).toBe("xoxb-plaintext-secret")

    // Verify the column on disk is NOT the plaintext.
    const [rawRow] = await pg.db.select().from(slackIntegrations)
    expect(rawRow?.botAccessToken).not.toBe("xoxb-plaintext-secret")
    expect(rawRow?.botAccessToken).toContain(":") // iv:authTag:ciphertext format

    const fetched = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }),
    )

    expect(fetched?.botAccessToken).toBe("xoxb-plaintext-secret")
  })

  it("translates a cross-org team_id conflict into SlackIntegrationConflictError", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        yield* repo.save(makeIntegration({ organizationId: ORG_B, teamId: "T-SHARED" }))
      }),
      ORG_B,
    )

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        yield* repo.save(makeIntegration({ teamId: "T-SHARED" }))
      }).pipe(withPostgres(SlackIntegrationRepositoryLive, pg.adminPostgresClient, ORG_A)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failReason = exit.cause.reasons.find(Cause.isFailReason)
      expect(failReason?.error).toBeInstanceOf(SlackIntegrationConflictError)
    }
  })

  it("softRevokeById returns true on first call, false thereafter", async () => {
    const saved = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.save(makeIntegration())
      }),
    )

    const [first, second] = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        const a = yield* repo.softRevokeById(saved.id, new Date())
        const b = yield* repo.softRevokeById(saved.id, new Date())
        return [a, b] as const
      }),
    )

    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it("findActiveByOrganizationId returns null when the install has been revoked", async () => {
    const saved = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.save(makeIntegration())
      }),
    )

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        yield* repo.softRevokeById(saved.id, new Date())
      }),
    )

    const fetched = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }),
    )

    expect(fetched).toBeNull()
  })

  it("admin findActiveByTeamIdAcrossOrgs returns the owning org regardless of RLS scope", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        yield* repo.save(makeIntegration({ organizationId: ORG_B, teamId: "T-X" }))
      }),
      ORG_B,
    )

    const found = await Effect.runPromise(findActiveSlackIntegrationByTeamIdAcrossOrgs(pg.postgresDb, "T-X"))
    expect(found?.organizationId).toBe(ORG_B)
  })

  it("admin softRevokeAcrossOrgs claims revocation idempotently", async () => {
    const saved = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.save(makeIntegration({ organizationId: ORG_B, teamId: "T-Y" }))
      }),
      ORG_B,
    )

    const first = await Effect.runPromise(softRevokeSlackIntegrationAcrossOrgs(pg.postgresDb, saved.id, new Date()))
    const second = await Effect.runPromise(softRevokeSlackIntegrationAcrossOrgs(pg.postgresDb, saved.id, new Date()))

    expect(first).toBe(true)
    expect(second).toBe(false)
  })
})
