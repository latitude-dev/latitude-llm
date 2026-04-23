import { AdminSearchRepository } from "@domain/admin"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { organizations, users } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AdminSearchRepositoryLive } from "./admin-search-repository.ts"

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AdminSearchRepository>) =>
  Effect.runPromise(effect.pipe(withPostgres(AdminSearchRepositoryLive, pg.adminPostgresClient)))

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG_A = makeId("org-alpha")
const ORG_B = makeId("org-beta")

describe("AdminSearchRepositoryLive.unifiedSearch", () => {
  beforeAll(async () => {
    const baseTime = new Date("2025-01-01T12:00:00.000Z")

    await pg.db.insert(users).values([
      {
        id: makeId("user-alice"),
        email: "alice@latitude.so",
        name: "Alice Admin",
        emailVerified: true,
        role: "admin" as const,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("user-bob"),
        email: "bob@example.com",
        name: "Bob Builder",
        emailVerified: true,
        role: "user" as const,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("user-carol"),
        email: "carol@alpha.test",
        name: "Carol",
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

    await pg.db.insert(projects).values([
      {
        id: makeId("proj-1"),
        organizationId: ORG_A,
        name: "alpha-prod",
        slug: "alpha-prod",
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("proj-2"),
        organizationId: ORG_B,
        name: "beta-staging",
        slug: "beta-staging",
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("proj-3"),
        organizationId: ORG_A,
        name: "alpha-archived",
        slug: "alpha-archived",
        deletedAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])
  })

  it("finds users across organizations by email or name (case-insensitive)", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminSearchRepository
        return yield* repo.unifiedSearch("ALICE", "all")
      }),
    )

    expect(result.users).toHaveLength(1)
    expect(result.users[0]?.email).toBe("alice@latitude.so")
    expect(result.users[0]?.role).toBe("admin")
  })

  it("includes users belonging to different organizations in a single query", async () => {
    // "a" is too short and should be rejected by the use-case, but the repo
    // itself doesn't short-circuit — it just runs ilike. Use a 2+ char query
    // that matches across both orgs.
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminSearchRepository
        return yield* repo.unifiedSearch("@", "user")
      }),
    )

    const emails = result.users.map((u) => u.email).sort()
    expect(emails).toEqual(["alice@latitude.so", "bob@example.com", "carol@alpha.test"])
    expect(result.organizations).toEqual([])
    expect(result.projects).toEqual([])
  })

  it("finds organizations by name or slug", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminSearchRepository
        return yield* repo.unifiedSearch("alpha", "organization")
      }),
    )

    expect(result.organizations.map((o) => o.name)).toEqual(["Alpha"])
    expect(result.users).toEqual([])
    expect(result.projects).toEqual([])
  })

  it("excludes soft-deleted projects", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminSearchRepository
        return yield* repo.unifiedSearch("alpha", "project")
      }),
    )

    const names = result.projects.map((p) => p.name).sort()
    expect(names).toEqual(["alpha-prod"])
  })

  it("returns entities matching the requested entityType only", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminSearchRepository
        return yield* repo.unifiedSearch("alpha", "all")
      }),
    )

    expect(result.users.map((u) => u.email)).toContain("carol@alpha.test")
    expect(result.organizations.map((o) => o.name)).toContain("Alpha")
    expect(result.projects.map((p) => p.name)).toContain("alpha-prod")
  })
})
