import { AdminOrganizationRepository } from "@domain/admin"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { members, organizations, users } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AdminOrganizationRepositoryLive } from "./admin-organization-repository.ts"

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AdminOrganizationRepository>) =>
  Effect.runPromise(effect.pipe(withPostgres(AdminOrganizationRepositoryLive, pg.adminPostgresClient)))

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = makeId("org-or-target")
const OWNER = makeId("user-or-owner")
const ADMIN = makeId("user-or-admin")
const PROJ_ALIVE = makeId("proj-or-alive")
const PROJ_DELETED = makeId("proj-or-deleted")

describe("AdminOrganizationRepositoryLive.findById", () => {
  beforeAll(async () => {
    const baseTime = new Date("2025-06-01T12:00:00.000Z")

    await pg.db.insert(users).values([
      {
        id: OWNER,
        email: "owner@example.com",
        name: "Owner User",
        emailVerified: true,
        role: "user" as const,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: ADMIN,
        email: "platform@latitude.so",
        name: "Platform Admin",
        emailVerified: true,
        role: "admin" as const,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])

    await pg.db.insert(organizations).values([
      {
        id: ORG,
        name: "Acme",
        slug: "acme",
        stripeCustomerId: "cus_test_123",
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])

    await pg.db.insert(members).values([
      { id: makeId("mem-owner"), organizationId: ORG, userId: OWNER, role: "owner" as const, createdAt: baseTime },
      { id: makeId("mem-admin"), organizationId: ORG, userId: ADMIN, role: "member" as const, createdAt: baseTime },
    ])

    await pg.db.insert(projects).values([
      { id: PROJ_ALIVE, organizationId: ORG, name: "live", slug: "live", createdAt: baseTime, updatedAt: baseTime },
      {
        id: PROJ_DELETED,
        organizationId: ORG,
        name: "archived",
        slug: "archived",
        deletedAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])
  })

  it("returns the organisation with members and active projects", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.findById(OrganizationId(ORG))
      }),
    )

    expect(result.id).toBe(ORG)
    expect(result.name).toBe("Acme")
    expect(result.stripeCustomerId).toBe("cus_test_123")

    expect(result.members).toHaveLength(2)
    const ownerMember = result.members.find((m) => m.user.id === OWNER)
    expect(ownerMember?.role).toBe("owner")
    expect(ownerMember?.user.email).toBe("owner@example.com")

    // Surface the platform-admin user role even when their per-org role
    // is just "member" — staff need to see "platform admin lurking in
    // tenant" at a glance.
    const platformAdminMember = result.members.find((m) => m.user.id === ADMIN)
    expect(platformAdminMember?.role).toBe("member")
    expect(platformAdminMember?.user.role).toBe("admin")
  })

  it("excludes soft-deleted projects from the projects list", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.findById(OrganizationId(ORG))
      }),
    )
    expect(result.projects.map((p) => p.id)).toEqual([PROJ_ALIVE])
  })

  it("fails with NotFoundError for a non-existent organisation id", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminOrganizationRepository
          return yield* repo.findById(OrganizationId(makeId("org-missing")))
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Organization" })
  })
})
