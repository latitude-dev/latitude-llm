import { AdminOrganizationRepository } from "@domain/admin"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { members, organizations, users } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"
import { sandboxes } from "../schema/sandboxes.ts"
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
const SANDBOX_ACTIVE_ORG = makeId("org-or-sbx-active")
const SANDBOX_ARCHIVED_ORG = makeId("org-or-sbx-archived")

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
      // Two sandbox orgs (children of ORG) — a sandbox is an org with a parent.
      {
        id: SANDBOX_ACTIVE_ORG,
        name: "Acme Sandbox Active",
        slug: "acme-sandbox-active",
        parentOrgId: ORG,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: SANDBOX_ARCHIVED_ORG,
        name: "Acme Sandbox Archived",
        slug: "acme-sandbox-archived",
        parentOrgId: ORG,
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

    await pg.db.insert(sandboxes).values([
      {
        id: makeId("sbx-active"),
        organizationId: SANDBOX_ACTIVE_ORG,
        status: "active",
        lastActivityAt: baseTime,
        createdByUserId: OWNER,
        createdAt: new Date("2025-06-02T12:00:00.000Z"),
        updatedAt: baseTime,
      },
      {
        id: makeId("sbx-archived"),
        organizationId: SANDBOX_ARCHIVED_ORG,
        status: "archived",
        lastActivityAt: baseTime,
        createdByUserId: OWNER,
        createdAt: new Date("2025-06-01T12:00:00.000Z"),
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

  it("returns every sandbox (active and archived) ordered by creation, newest first", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.findById(OrganizationId(ORG))
      }),
    )

    expect(result.sandboxes.map((s) => s.organizationId)).toEqual([SANDBOX_ACTIVE_ORG, SANDBOX_ARCHIVED_ORG])
    const [active, archived] = result.sandboxes
    expect(active?.status).toBe("active")
    expect(active?.name).toBe("Acme Sandbox Active")
    expect(active?.owner?.email).toBe("owner@example.com")
    expect(archived?.status).toBe("archived")
  })

  it("does not surface sandboxes as projects or as the org itself", async () => {
    // A sandbox org should never come back when looking up that sandbox's
    // *parent*: it's only ever exposed through the `sandboxes` collection.
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.findById(OrganizationId(ORG))
      }),
    )
    expect(result.projects.map((p) => p.id)).not.toContain(SANDBOX_ACTIVE_ORG)
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

  it("omits sandbox orgs from findManySummariesByIds (usage listing)", async () => {
    // Even if ClickHouse ranks a sandbox org by trace count, hydrating it
    // here must drop it so the usage listing only shows real customer orgs.
    const summaries = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.findManySummariesByIds([
          OrganizationId(ORG),
          OrganizationId(SANDBOX_ACTIVE_ORG),
          OrganizationId(SANDBOX_ARCHIVED_ORG),
        ])
      }),
    )

    expect(summaries.has(OrganizationId(ORG))).toBe(true)
    expect(summaries.has(OrganizationId(SANDBOX_ACTIVE_ORG))).toBe(false)
    expect(summaries.has(OrganizationId(SANDBOX_ARCHIVED_ORG))).toBe(false)
  })
})
