import type { OrganizationId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  listOrganizationsByUsageUseCase,
  ORGANIZATION_USAGE_MAX_LIMIT,
  ORGANIZATION_USAGE_WINDOW_DAYS,
} from "./list-organizations-by-usage.ts"
import { AdminOrganizationRepository, type AdminOrganizationSummary } from "./organization-repository.ts"
import { AdminOrganizationUsageRepository, type AdminOrganizationUsageRow } from "./organization-usage-repository.ts"

const NOW = new Date("2026-04-30T12:00:00Z")
const orgId = (raw: string) => raw as OrganizationId

const usageRepo = (
  pages: readonly { rows: readonly AdminOrganizationUsageRow[]; hasMore: boolean }[],
  capture?: { lastSince?: Date; lastCursor?: unknown; lastLimit?: number },
) => {
  let call = 0
  return Layer.succeed(AdminOrganizationUsageRepository, {
    listByTraceCount: (input) =>
      Effect.sync(() => {
        if (capture) {
          capture.lastSince = input.since
          capture.lastCursor = input.cursor
          capture.lastLimit = input.limit
        }
        const page = pages[call] ?? { rows: [], hasMore: false }
        call += 1
        return page
      }),
  })
}

const orgRepo = (summaries: ReadonlyMap<OrganizationId, AdminOrganizationSummary>) =>
  Layer.succeed(AdminOrganizationRepository, {
    findById: () => Effect.die("findById not used in usage tests"),
    findManySummariesByIds: () => Effect.succeed(summaries),
    findFirstApiKeyId: () => Effect.die("findFirstApiKeyId not used in usage tests"),
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
  it("returns empty page when CH reports no activity", async () => {
    const result = await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(usageRepo([{ rows: [], hasMore: false }])),
        Effect.provide(orgRepo(new Map())),
      ),
    )
    expect(result).toEqual({ items: [], nextCursor: null })
  })

  it("hydrates rows from PG and preserves CH ordering", async () => {
    const rows: AdminOrganizationUsageRow[] = [
      { organizationId: orgId("a"), traceCount: 100, lastTraceAt: new Date("2026-04-29") },
      { organizationId: orgId("b"), traceCount: 50, lastTraceAt: null },
    ]
    const summaries = new Map<OrganizationId, AdminOrganizationSummary>([
      [orgId("a"), mkSummary("a", { plan: "team", memberCount: 5 })],
      [orgId("b"), mkSummary("b", { plan: null, memberCount: 1 })],
    ])

    const result = await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(usageRepo([{ rows, hasMore: false }])),
        Effect.provide(orgRepo(summaries)),
      ),
    )

    expect(result.items.map((i) => i.id)).toEqual(["a", "b"])
    expect(result.items[0]).toMatchObject({
      id: "a",
      plan: "team",
      memberCount: 5,
      traceCount: 100,
      lastTraceAt: new Date("2026-04-29"),
    })
    expect(result.nextCursor).toBeNull()
  })

  it("anchors nextCursor on the last CH row (not the last hydrated item) so dropped orgs are not re-fetched", async () => {
    const rows: AdminOrganizationUsageRow[] = [
      { organizationId: orgId("a"), traceCount: 100, lastTraceAt: null },
      { organizationId: orgId("ghost"), traceCount: 90, lastTraceAt: null },
    ]
    const summaries = new Map<OrganizationId, AdminOrganizationSummary>([[orgId("a"), mkSummary("a")]])

    const result = await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW }).pipe(
        Effect.provide(usageRepo([{ rows, hasMore: true }])),
        Effect.provide(orgRepo(summaries)),
      ),
    )

    expect(result.items.map((i) => i.id)).toEqual(["a"])
    expect(result.nextCursor).toEqual({ traceCount: 90, organizationId: "ghost" })
  })

  it("computes the rolling window relative to `now`", async () => {
    const capture: { lastSince?: Date; lastCursor?: unknown; lastLimit?: number } = {}

    await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW, limit: 25 }).pipe(
        Effect.provide(usageRepo([{ rows: [], hasMore: false }], capture)),
        Effect.provide(orgRepo(new Map())),
      ),
    )

    const expectedSince = new Date(NOW.getTime() - ORGANIZATION_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    expect(capture.lastSince).toEqual(expectedSince)
    expect(capture.lastLimit).toBe(25)
  })

  it("clamps oversized limits to the configured maximum", async () => {
    const capture: { lastLimit?: number } = {}
    await Effect.runPromise(
      listOrganizationsByUsageUseCase({ now: NOW, limit: 9999 }).pipe(
        Effect.provide(usageRepo([{ rows: [], hasMore: false }], capture)),
        Effect.provide(orgRepo(new Map())),
      ),
    )
    expect(capture.lastLimit).toBe(ORGANIZATION_USAGE_MAX_LIMIT)
  })

  it("forwards the cursor to the repository when set", async () => {
    const capture: { lastCursor?: unknown } = {}
    await Effect.runPromise(
      listOrganizationsByUsageUseCase({
        now: NOW,
        cursor: { traceCount: 7, organizationId: "x" },
      }).pipe(Effect.provide(usageRepo([{ rows: [], hasMore: false }], capture)), Effect.provide(orgRepo(new Map()))),
    )
    expect(capture.lastCursor).toEqual({ traceCount: 7, organizationId: "x" })
  })
})
