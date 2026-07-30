import type { OrganizationId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  listOrganizationsByUsageUseCase,
  ORGANIZATION_USAGE_MAX_LIMIT,
  ORGANIZATION_USAGE_WINDOW_DAYS,
} from "./list-organizations-by-usage.ts"
import {
  type AdminOrganizationCreditSpendRow,
  AdminOrganizationRepository,
  type AdminOrganizationSummary,
} from "./organization-repository.ts"
import { AdminOrganizationUsageRepository, type AdminOrganizationUsageRow } from "./organization-usage-repository.ts"

const NOW = new Date("2026-04-30T12:00:00Z")
const orgId = (raw: string) => raw as OrganizationId

const orgRepo = (
  creditPage: { rows: readonly AdminOrganizationCreditSpendRow[]; hasMore: boolean },
  summaries: ReadonlyMap<OrganizationId, AdminOrganizationSummary>,
  capture?: { lastNow?: Date; lastCursor?: unknown; lastLimit?: number },
) =>
  Layer.succeed(AdminOrganizationRepository, {
    findById: () => Effect.die("findById not used in usage tests"),
    findManySummariesByIds: () => Effect.succeed(summaries),
    listByConsumedCredits: (input) =>
      Effect.sync(() => {
        if (capture) {
          capture.lastNow = input.now
          capture.lastCursor = input.cursor
          capture.lastLimit = input.limit
        }
        return creditPage
      }),
    findFirstApiKeyId: () => Effect.die("findFirstApiKeyId not used in usage tests"),
    setWantsShowcase: () => Effect.die("setWantsShowcase not used in usage tests"),
  })

const usageRepo = (
  usage: ReadonlyMap<OrganizationId, AdminOrganizationUsageRow>,
  capture?: { lastSince?: Date; lastIds?: readonly OrganizationId[] },
) =>
  Layer.succeed(AdminOrganizationUsageRepository, {
    findManyByOrganizationIds: (input) =>
      Effect.sync(() => {
        if (capture) {
          capture.lastSince = input.since
          capture.lastIds = input.organizationIds
        }
        const result = new Map<OrganizationId, AdminOrganizationUsageRow>()
        for (const id of input.organizationIds) {
          const row = usage.get(id)
          if (row) result.set(id, row)
        }
        return result
      }),
  })

const mkSummary = (id: string, overrides: Partial<AdminOrganizationSummary> = {}): AdminOrganizationSummary => ({
  id: orgId(id),
  name: id.toUpperCase(),
  slug: id,
  plan: null,
  memberCount: 0,
  createdAt: new Date("2024-01-01"),
  ...overrides,
})

describe("listOrganizationsByUsageUseCase", () => {
  it("returns empty page when no orgs have current-period credit spend", async () => {
    const result = await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(orgRepo({ rows: [], hasMore: false }, new Map())),
        Effect.provide(usageRepo(new Map())),
      ),
    )
    expect(result).toEqual({ items: [], nextCursor: null })
  })

  it("hydrates rows from PG + CH and preserves credit-spend ordering", async () => {
    const rows: AdminOrganizationCreditSpendRow[] = [
      { organizationId: orgId("a"), consumedCredits: 10_000 },
      { organizationId: orgId("b"), consumedCredits: 5_000 },
    ]
    const summaries = new Map<OrganizationId, AdminOrganizationSummary>([
      [orgId("a"), mkSummary("a", { plan: "team", memberCount: 5 })],
      [orgId("b"), mkSummary("b", { plan: null, memberCount: 1 })],
    ])
    const usage = new Map<OrganizationId, AdminOrganizationUsageRow>([
      [orgId("a"), { organizationId: orgId("a"), traceCount: 100, lastTraceAt: new Date("2026-04-29") }],
      [orgId("b"), { organizationId: orgId("b"), traceCount: 50, lastTraceAt: null }],
    ])

    const result = await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(orgRepo({ rows, hasMore: false }, summaries)),
        Effect.provide(usageRepo(usage)),
      ),
    )

    expect(result.items.map((i) => i.id)).toEqual(["a", "b"])
    expect(result.items[0]).toMatchObject({
      id: "a",
      plan: "team",
      memberCount: 5,
      consumedCredits: 10_000,
      traceCount: 100,
      lastTraceAt: new Date("2026-04-29"),
    })
    expect(result.items[1]).toMatchObject({
      id: "b",
      consumedCredits: 5_000,
      traceCount: 50,
      lastTraceAt: null,
    })
    expect(result.nextCursor).toBeNull()
  })

  it("defaults missing CH usage to zero traces", async () => {
    const rows: AdminOrganizationCreditSpendRow[] = [{ organizationId: orgId("a"), consumedCredits: 42 }]
    const summaries = new Map<OrganizationId, AdminOrganizationSummary>([[orgId("a"), mkSummary("a")]])

    const result = await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(orgRepo({ rows, hasMore: false }, summaries)),
        Effect.provide(usageRepo(new Map())),
      ),
    )

    expect(result.items[0]).toMatchObject({
      id: "a",
      consumedCredits: 42,
      traceCount: 0,
      lastTraceAt: null,
    })
  })

  it("anchors nextCursor on the last ranking row (not the last hydrated item) so dropped orgs are not re-fetched", async () => {
    const rows: AdminOrganizationCreditSpendRow[] = [
      { organizationId: orgId("a"), consumedCredits: 100 },
      { organizationId: orgId("ghost"), consumedCredits: 90 },
    ]
    const summaries = new Map<OrganizationId, AdminOrganizationSummary>([[orgId("a"), mkSummary("a")]])

    const result = await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(orgRepo({ rows, hasMore: true }, summaries)),
        Effect.provide(usageRepo(new Map())),
      ),
    )

    expect(result.items.map((i) => i.id)).toEqual(["a"])
    expect(result.nextCursor).toEqual({ consumedCredits: 90, organizationId: "ghost" })
  })

  it("forwards now and limit to the credit ranking without enriching traces on an empty page", async () => {
    const creditCapture: { lastNow?: Date; lastCursor?: unknown; lastLimit?: number } = {}
    const usageCapture: { lastSince?: Date; lastIds?: readonly OrganizationId[] } = {}

    await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW, limit: 25 }).pipe(
        Effect.provide(orgRepo({ rows: [], hasMore: false }, new Map(), creditCapture)),
        Effect.provide(usageRepo(new Map(), usageCapture)),
      ),
    )

    expect(creditCapture.lastNow).toEqual(NOW)
    expect(creditCapture.lastLimit).toBe(25)
    expect(usageCapture.lastSince).toBeUndefined()
  })

  it("forwards organization ids to the traces enrichment when ranking returns rows", async () => {
    const usageCapture: { lastSince?: Date; lastIds?: readonly OrganizationId[] } = {}
    const rows: AdminOrganizationCreditSpendRow[] = [{ organizationId: orgId("a"), consumedCredits: 1 }]
    const summaries = new Map<OrganizationId, AdminOrganizationSummary>([[orgId("a"), mkSummary("a")]])

    await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(orgRepo({ rows, hasMore: false }, summaries)),
        Effect.provide(usageRepo(new Map(), usageCapture)),
      ),
    )

    const expectedSince = new Date(NOW.getTime() - ORGANIZATION_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    expect(usageCapture.lastSince).toEqual(expectedSince)
    expect(usageCapture.lastIds).toEqual([orgId("a")])
  })

  it("clamps oversized limits to the configured maximum", async () => {
    const capture: { lastLimit?: number } = {}
    await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW, limit: 9999 }).pipe(
        Effect.provide(orgRepo({ rows: [], hasMore: false }, new Map(), capture)),
        Effect.provide(usageRepo(new Map())),
      ),
    )
    expect(capture.lastLimit).toBe(ORGANIZATION_USAGE_MAX_LIMIT)
  })

  it("forwards the cursor to the repository when set", async () => {
    const capture: { lastCursor?: unknown } = {}
    await Effect.runPromise(
      listOrganizationsByUsageUseCase({
        now: NOW,
        cursor: { consumedCredits: 7, organizationId: "x" },
      }).pipe(
        Effect.provide(orgRepo({ rows: [], hasMore: false }, new Map(), capture)),
        Effect.provide(usageRepo(new Map())),
      ),
    )
    expect(capture.lastCursor).toEqual({ consumedCredits: 7, organizationId: "x" })
  })
})
