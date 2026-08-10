import { AdminOrganizationRepository } from "@domain/admin"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { members, organizations, users } from "../schema/better-auth.ts"
import { billingUsagePeriods } from "../schema/billing.ts"
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
    // No settings seeded → defaults to false.
    expect(result.wantsShowcase).toBe(false)

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

describe("AdminOrganizationRepositoryLive.setWantsShowcase", () => {
  const readFlag = (orgId: string) =>
    runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.findById(OrganizationId(orgId))
      }),
    ).then((details) => details.wantsShowcase)

  it("toggles the flag and merges into existing settings", async () => {
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        yield* repo.setWantsShowcase(OrganizationId(ORG), true)
      }),
    )
    expect(await readFlag(ORG)).toBe(true)

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        yield* repo.setWantsShowcase(OrganizationId(ORG), false)
      }),
    )
    expect(await readFlag(ORG)).toBe(false)
  })

  it("fails with NotFoundError for a non-existent organisation id", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminOrganizationRepository
          yield* repo.setWantsShowcase(OrganizationId(makeId("org-missing")), true)
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Organization" })
  })
})

describe("AdminOrganizationRepositoryLive.listByConsumedCredits", () => {
  const NOW = new Date("2026-04-15T12:00:00.000Z")
  const PERIOD_START = new Date("2026-04-01T00:00:00.000Z")
  const PERIOD_END = new Date("2026-05-01T00:00:00.000Z")
  const PAST_START = new Date("2026-03-01T00:00:00.000Z")
  const PAST_END = new Date("2026-04-01T00:00:00.000Z")

  const ORG_HIGH = makeId("org-credit-high")
  const ORG_MID = makeId("org-credit-mid")
  const ORG_LOW = makeId("org-credit-low")
  const ORG_ZERO = makeId("org-credit-zero")
  const ORG_SANDBOX = makeId("org-credit-sbx")
  const ORG_PARENT = makeId("org-credit-parent")

  beforeAll(async () => {
    const baseTime = new Date("2025-06-01T12:00:00.000Z")

    await pg.db.insert(organizations).values([
      { id: ORG_HIGH, name: "High Spend", slug: "high-spend", createdAt: baseTime, updatedAt: baseTime },
      { id: ORG_MID, name: "Mid Spend", slug: "mid-spend", createdAt: baseTime, updatedAt: baseTime },
      { id: ORG_LOW, name: "Low Spend", slug: "low-spend", createdAt: baseTime, updatedAt: baseTime },
      { id: ORG_ZERO, name: "Zero Spend", slug: "zero-spend", createdAt: baseTime, updatedAt: baseTime },
      { id: ORG_PARENT, name: "Sandbox Parent", slug: "sandbox-parent", createdAt: baseTime, updatedAt: baseTime },
      {
        id: ORG_SANDBOX,
        name: "Sandbox Child",
        slug: "sandbox-child",
        parentOrgId: ORG_PARENT,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])

    await pg.db.insert(billingUsagePeriods).values([
      {
        id: makeId("bup-high"),
        organizationId: ORG_HIGH,
        planSlug: "pro",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 100_000,
        consumedCredits: 50_000,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("bup-mid"),
        organizationId: ORG_MID,
        planSlug: "pro",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 100_000,
        consumedCredits: 20_000,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("bup-low"),
        organizationId: ORG_LOW,
        planSlug: "free",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        consumedCredits: 5_000,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("bup-zero"),
        organizationId: ORG_ZERO,
        planSlug: "free",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        consumedCredits: 0,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("bup-sbx"),
        organizationId: ORG_SANDBOX,
        planSlug: "free",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        includedCredits: 20_000,
        consumedCredits: 99_000,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("bup-past"),
        organizationId: ORG_LOW,
        planSlug: "free",
        periodStart: PAST_START,
        periodEnd: PAST_END,
        includedCredits: 20_000,
        consumedCredits: 80_000,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])
  })

  it("ranks non-sandbox orgs by current-period consumed credits descending", async () => {
    const page = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.listByConsumedCredits({ now: NOW, limit: 10 })
      }),
    )

    expect(page.hasMore).toBe(false)
    expect(page.rows.map((r) => ({ id: r.organizationId as string, credits: r.consumedCredits }))).toEqual([
      { id: ORG_HIGH, credits: 50_000 },
      { id: ORG_MID, credits: 20_000 },
      { id: ORG_LOW, credits: 5_000 },
    ])
  })

  it("paginates with a composite consumedCredits + organizationId cursor", async () => {
    const first = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.listByConsumedCredits({ now: NOW, limit: 1 })
      }),
    )
    expect(first.rows).toHaveLength(1)
    expect(first.hasMore).toBe(true)
    const firstRow = first.rows[0]
    expect(firstRow).toBeDefined()
    if (!firstRow) throw new Error("expected first page row")
    expect(firstRow.organizationId).toBe(ORG_HIGH)

    const second = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.listByConsumedCredits({
          now: NOW,
          limit: 10,
          cursor: {
            consumedCredits: firstRow.consumedCredits,
            organizationId: firstRow.organizationId as string,
            asOf: NOW,
          },
        })
      }),
    )

    expect(second.rows.map((r) => r.organizationId as string)).toEqual([ORG_MID, ORG_LOW])
    expect(second.hasMore).toBe(false)
  })

  it("picks the earliest overlapping current period before applying the zero-spend filter", async () => {
    // Earliest overlapping row has 0 credits; a later overlapping row has spend.
    // findOptionalCurrent would pick the earliest (zero) — ranking must match
    // and therefore exclude the org rather than promote the later spend row.
    const ORG_OVERLAP = makeId("org-credit-overlap")
    const baseTime = new Date("2025-06-01T12:00:00.000Z")
    const earlyStart = new Date("2026-03-15T00:00:00.000Z")
    const lateStart = new Date("2026-04-01T00:00:00.000Z")
    const lateEnd = new Date("2026-05-15T00:00:00.000Z")

    await pg.db.insert(organizations).values({
      id: ORG_OVERLAP,
      name: "Overlap",
      slug: "overlap",
      createdAt: baseTime,
      updatedAt: baseTime,
    })
    await pg.db.insert(billingUsagePeriods).values([
      {
        id: makeId("bup-ov-early"),
        organizationId: ORG_OVERLAP,
        planSlug: "free",
        periodStart: earlyStart,
        periodEnd: lateEnd,
        includedCredits: 20_000,
        consumedCredits: 0,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
      {
        id: makeId("bup-ov-late"),
        organizationId: ORG_OVERLAP,
        planSlug: "pro",
        periodStart: lateStart,
        periodEnd: lateEnd,
        includedCredits: 100_000,
        consumedCredits: 75_000,
        overageCredits: 0,
        reportedOverageCredits: 0,
        overageAmountMills: 0,
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])

    const page = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminOrganizationRepository
        return yield* repo.listByConsumedCredits({ now: NOW, limit: 50 })
      }),
    )

    expect(page.rows.map((r) => r.organizationId as string)).not.toContain(ORG_OVERLAP)
  })
})
