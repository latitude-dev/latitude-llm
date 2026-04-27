import { AdminUserRepository } from "@domain/admin"
import { UserId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { members, organizations, users } from "../schema/better-auth.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AdminUserRepositoryLive } from "./admin-user-repository.ts"

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AdminUserRepository>) =>
  Effect.runPromise(effect.pipe(withPostgres(AdminUserRepositoryLive, pg.adminPostgresClient)))

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG_A = makeId("org-user-alpha")
const ORG_B = makeId("org-user-beta")
const TARGET = makeId("user-target")
const UNMEMBERED = makeId("user-unmembered")

describe("AdminUserRepositoryLive.findById", () => {
  beforeAll(async () => {
    const baseTime = new Date("2025-06-01T12:00:00.000Z")

    await pg.db.insert(users).values([
      {
        id: TARGET,
        email: "target@example.com",
        name: "Target User",
        emailVerified: true,
        role: "user" as const,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: UNMEMBERED,
        email: "lonely@example.com",
        name: "Lonely User",
        emailVerified: true,
        role: "user" as const,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])

    await pg.db.insert(organizations).values([
      { id: ORG_A, name: "Alpha", slug: "alpha", createdAt: baseTime, updatedAt: baseTime },
      { id: ORG_B, name: "Beta Inc", slug: "beta-inc", createdAt: baseTime, updatedAt: baseTime },
    ])

    await pg.db.insert(members).values([
      { id: makeId("mem-a"), organizationId: ORG_A, userId: TARGET, role: "member" as const, createdAt: baseTime },
      { id: makeId("mem-b"), organizationId: ORG_B, userId: TARGET, role: "owner" as const, createdAt: baseTime },
    ])
  })

  it("returns the user and all of their org memberships across tenants", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminUserRepository
        return yield* repo.findById(UserId(TARGET))
      }),
    )

    expect(result.id).toBe(TARGET)
    expect(result.email).toBe("target@example.com")
    expect(result.role).toBe("user")
    expect(result.memberships.map((m) => m.organizationSlug).sort()).toEqual(["alpha", "beta-inc"])
    // Membership roles are returned as-is from the members table (owner/admin/member).
    const byOrg = new Map(result.memberships.map((m) => [m.organizationSlug, m.role]))
    expect(byOrg.get("alpha")).toBe("member")
    expect(byOrg.get("beta-inc")).toBe("owner")
  })

  it("returns an empty memberships array for a user with no org memberships", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminUserRepository
        return yield* repo.findById(UserId(UNMEMBERED))
      }),
    )

    expect(result.id).toBe(UNMEMBERED)
    expect(result.memberships).toEqual([])
  })

  it("fails with NotFoundError for a non-existent user id", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminUserRepository
          return yield* repo.findById(UserId(makeId("user-missing")))
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "User" })
  })
})
