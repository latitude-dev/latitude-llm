import { AdminUserRepository } from "@domain/admin"
import { UserId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { members, organizations, sessions, users } from "../schema/better-auth.ts"
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
const ADMIN = makeId("user-admin-imper")
const SESSION_LIVE = makeId("s-live")
const SESSION_IMP = makeId("s-imp")
const SESSION_DEAD = makeId("s-dead")
const FUTURE = new Date("2099-01-01T00:00:00.000Z")
const PAST = new Date("2020-01-01T00:00:00.000Z")

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
      {
        id: ADMIN,
        email: "admin@latitude.so",
        name: "Admin User",
        emailVerified: true,
        role: "admin" as const,
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

    // Three sessions for TARGET:
    //   - LIVE: a normal browser session that should surface
    //   - IMP : an active impersonation by ADMIN (should sort first)
    //   - DEAD: an expired session (must be filtered out)
    await pg.db.insert(sessions).values([
      {
        id: SESSION_LIVE,
        userId: TARGET,
        token: "tok-live",
        ipAddress: "203.0.113.5",
        userAgent: "Mozilla/5.0",
        expiresAt: FUTURE,
        createdAt: new Date("2025-06-02T10:00:00.000Z"),
        updatedAt: new Date("2025-06-02T11:00:00.000Z"),
      },
      {
        id: SESSION_IMP,
        userId: TARGET,
        token: "tok-imp",
        ipAddress: "203.0.113.10",
        userAgent: "Mozilla/5.0",
        expiresAt: FUTURE,
        impersonatedBy: ADMIN,
        // updatedAt earlier than the live session — proves the
        // impersonation-first sort beats the recency sort.
        createdAt: new Date("2025-06-02T08:00:00.000Z"),
        updatedAt: new Date("2025-06-02T09:00:00.000Z"),
      },
      {
        id: SESSION_DEAD,
        userId: TARGET,
        token: "tok-dead",
        ipAddress: "203.0.113.99",
        userAgent: "Mozilla/5.0",
        expiresAt: PAST,
        createdAt: PAST,
        updatedAt: PAST,
      },
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
    expect(result.sessions).toEqual([])
  })

  it("returns only active sessions, sorts impersonation first, and resolves the impersonator email", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminUserRepository
        return yield* repo.findById(UserId(TARGET))
      }),
    )

    // The expired `s-dead` session is filtered out by the
    // `expires_at > now()` predicate; only the two live rows remain.
    expect(result.sessions.map((s) => s.id)).toEqual([SESSION_IMP, SESSION_LIVE])

    const [imp, live] = result.sessions
    if (!imp || !live) throw new Error("expected two sessions")
    expect(imp.impersonatedByUserId).toBe(ADMIN)
    expect(imp.impersonatedByEmail).toBe("admin@latitude.so")
    expect(live.impersonatedByUserId).toBeNull()
    expect(live.impersonatedByEmail).toBeNull()
  })

  it("findById does NOT surface session tokens — they're a live credential and stay server-side", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminUserRepository
        return yield* repo.findById(UserId(TARGET))
      }),
    )

    for (const session of result.sessions) {
      expect(session).not.toHaveProperty("token")
    }
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

describe("AdminUserRepositoryLive.findActiveSessionTokenForUser", () => {
  it("returns the token for an active session that belongs to the named user", async () => {
    const token = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminUserRepository
        return yield* repo.findActiveSessionTokenForUser(UserId(TARGET), SESSION_LIVE)
      }),
    )
    expect(token).toBe("tok-live")
  })

  it("works for an impersonation session as well — token belongs to the impersonated user, not the admin", async () => {
    const token = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminUserRepository
        return yield* repo.findActiveSessionTokenForUser(UserId(TARGET), SESSION_IMP)
      }),
    )
    expect(token).toBe("tok-imp")
  })

  it("fails with NotFoundError when the session id exists but belongs to a different user", async () => {
    // SESSION_LIVE belongs to TARGET; asking under UNMEMBERED must
    // collapse into NotFoundError (not return the token).
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminUserRepository
          return yield* repo.findActiveSessionTokenForUser(UserId(UNMEMBERED), SESSION_LIVE)
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Session" })
  })

  it("fails with NotFoundError when the session is expired (the active-only filter applies)", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminUserRepository
          return yield* repo.findActiveSessionTokenForUser(UserId(TARGET), SESSION_DEAD)
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Session" })
  })

  it("fails with NotFoundError for an unknown session id", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminUserRepository
          return yield* repo.findActiveSessionTokenForUser(UserId(TARGET), makeId("s-missing"))
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Session" })
  })
})
