import { createOrganization, OrganizationRepository } from "@domain/organizations"
import { generateId, OrganizationId, type SqlClient } from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { organizations } from "../schema/better-auth.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { OrganizationRepositoryLive } from "./organization-repository.ts"

const pg = setupTestPostgres()

const runWithRepo = <A, E>(organizationId: OrganizationId, effect: Effect.Effect<A, E, OrganizationRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(OrganizationRepositoryLive, pg.adminPostgresClient, organizationId)))

describe("OrganizationRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(organizations)
  })

  it("clears expires_at when saving an existing organization", async () => {
    const organizationId = OrganizationId(generateId())
    const expiresAt = new Date(Date.now() + 60_000)
    const organization = createOrganization({
      id: organizationId,
      name: "Temp Org",
      slug: `temp-${organizationId}`,
      expiresAt,
    })

    await runWithRepo(
      organizationId,
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        yield* repo.save(organization)
        yield* repo.save({ ...organization, expiresAt: null })
      }),
    )

    const [row] = await pg.db.select().from(organizations).where(eq(organizations.id, organizationId))
    expect(row?.expiresAt).toBeNull()
  })

  it("deleteIfExpiredUnclaimed removes only orgs that still have expires_at set", async () => {
    const expiredId = OrganizationId(generateId())
    const claimedId = OrganizationId(generateId())
    const expiresAt = new Date(Date.now() - 60_000)

    await runWithRepo(
      expiredId,
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        yield* repo.save(
          createOrganization({
            id: expiredId,
            name: "Expired Org",
            slug: `expired-${expiredId}`,
            expiresAt,
          }),
        )
      }),
    )
    await runWithRepo(
      claimedId,
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        yield* repo.save(
          createOrganization({
            id: claimedId,
            name: "Claimed Org",
            slug: `claimed-${claimedId}`,
            expiresAt: null,
          }),
        )
      }),
    )

    const deletedExpired = await runWithRepo(
      expiredId,
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.deleteIfExpiredUnclaimed(expiredId)
      }),
    )
    const deletedClaimed = await runWithRepo(
      claimedId,
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.deleteIfExpiredUnclaimed(claimedId)
      }),
    )

    expect(deletedExpired).toBe(true)
    expect(deletedClaimed).toBe(false)

    const remaining = await pg.db.select({ id: organizations.id }).from(organizations)
    expect(remaining.map((row) => row.id)).toEqual([claimedId])
  })
})
