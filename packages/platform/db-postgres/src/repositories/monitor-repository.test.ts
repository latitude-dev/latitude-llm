import { type Monitor, MonitorRepository } from "@domain/monitors"
import { generateId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { monitorAlerts as monitorAlertsTable } from "../schema/monitor-alerts.ts"
import { monitors as monitorsTable } from "../schema/monitors.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { MonitorRepositoryLive } from "./monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("p".repeat(24))
const projectId = ProjectId("a".repeat(24))
const otherProjectId = ProjectId("b".repeat(24))

const baseMonitor = {
  organizationId: organizationId as string,
  projectId: projectId as string,
  description: "",
  system: false,
  mutedAt: null,
  deletedAt: null,
}

const baseAlert = {
  organizationId: organizationId as string,
  kind: "savedSearch.match" as const,
  sourceType: "savedSearch" as const,
  sourceId: "s".repeat(24),
  condition: null,
  severity: "medium" as const,
}

const makeMonitorRow = (
  overrides: Partial<typeof monitorsTable.$inferInsert> & { id: string; slug: string; name: string },
): typeof monitorsTable.$inferInsert => ({
  ...baseMonitor,
  createdAt: new Date("2026-05-29T10:00:00.000Z"),
  updatedAt: new Date("2026-05-29T10:00:00.000Z"),
  ...overrides,
})

const makeAlertRow = (
  overrides: Partial<typeof monitorAlertsTable.$inferInsert> & { id: string; monitorId: string },
): typeof monitorAlertsTable.$inferInsert => ({
  ...baseAlert,
  createdAt: new Date("2026-05-29T10:00:00.000Z"),
  ...overrides,
})

// App-role client — RLS is enforced. The repository runs under the
// `latitude_app` role and the SqlClient sets `app.current_organization_id`
// for the duration of the call, so these tests catch policy regressions.
const provideRls = (database: InMemoryPostgres, org: OrganizationId) =>
  withPostgres(MonitorRepositoryLive, database.appPostgresClient, org)

describe("MonitorRepositoryLive", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(monitorAlertsTable)
    await database.db.delete(monitorsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  describe("list", () => {
    it("returns an empty page for a project with no monitors", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(result).toEqual({ items: [], totalCount: 0, hasMore: false, limit: 50, offset: 0 })
    })

    it("orders system monitors first, then by createdAt desc", async () => {
      const systemId = generateId()
      const userOlderId = generateId()
      const userNewerId = generateId()

      await database.db.insert(monitorsTable).values([
        makeMonitorRow({
          id: userOlderId,
          slug: "user-older",
          name: "User older",
          createdAt: new Date("2026-05-28T10:00:00.000Z"),
        }),
        makeMonitorRow({
          id: userNewerId,
          slug: "user-newer",
          name: "User newer",
          createdAt: new Date("2026-05-29T10:00:00.000Z"),
        }),
        makeMonitorRow({
          id: systemId,
          slug: "issue-discovered",
          name: "Issue discovered",
          system: true,
          createdAt: new Date("2026-05-27T10:00:00.000Z"),
        }),
      ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(result.items.map((m) => m.slug)).toEqual(["issue-discovered", "user-newer", "user-older"])
      expect(result.totalCount).toBe(3)
    })

    it("filters by case-insensitive substring on name", async () => {
      await database.db
        .insert(monitorsTable)
        .values([
          makeMonitorRow({ id: generateId(), slug: "production-issues", name: "Production issues" }),
          makeMonitorRow({ id: generateId(), slug: "5xx-spikes", name: "5xx spikes" }),
          makeMonitorRow({ id: generateId(), slug: "low-issues", name: "Login issues" }),
        ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0, searchQuery: "ISSUES" })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(result.items.map((m) => m.name).sort()).toEqual(["Login issues", "Production issues"])
      expect(result.totalCount).toBe(2)
    })

    it("respects pagination and reports hasMore", async () => {
      for (let i = 0; i < 5; i++) {
        const created = new Date(2026, 4, 29, 10, i)
        await database.db.insert(monitorsTable).values(
          makeMonitorRow({
            id: generateId(),
            slug: `m-${i}`,
            name: `Monitor ${i}`,
            createdAt: created,
            updatedAt: created,
          }),
        )
      }

      const firstPage = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 2, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(firstPage.items.length).toBe(2)
      expect(firstPage.totalCount).toBe(5)
      expect(firstPage.hasMore).toBe(true)

      const lastPage = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 2, offset: 4 })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(lastPage.items.length).toBe(1)
      expect(lastPage.hasMore).toBe(false)
    })

    it("excludes soft-deleted rows from list and totalCount", async () => {
      await database.db.insert(monitorsTable).values([
        makeMonitorRow({ id: generateId(), slug: "alive", name: "Alive" }),
        makeMonitorRow({
          id: generateId(),
          slug: "deleted",
          name: "Deleted",
          deletedAt: new Date("2026-05-29T11:00:00.000Z"),
        }),
      ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(result.items.map((m) => m.slug)).toEqual(["alive"])
      expect(result.totalCount).toBe(1)
    })

    it("loads alerts ordered by createdAt for each monitor", async () => {
      const monitorId = generateId()
      await database.db
        .insert(monitorsTable)
        .values(makeMonitorRow({ id: monitorId, slug: "with-alerts", name: "With alerts" }))
      await database.db.insert(monitorAlertsTable).values([
        makeAlertRow({
          id: generateId(),
          monitorId,
          createdAt: new Date("2026-05-29T10:01:00.000Z"),
          severity: "high",
        }),
        makeAlertRow({
          id: generateId(),
          monitorId,
          createdAt: new Date("2026-05-29T10:00:00.000Z"),
          severity: "low",
        }),
      ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      const monitor = result.items[0] as Monitor
      expect(monitor.alerts.map((a) => a.severity)).toEqual(["low", "high"])
    })

    it("excludes soft-deleted alerts from a monitor's alert list", async () => {
      const monitorId = generateId()
      await database.db
        .insert(monitorsTable)
        .values(makeMonitorRow({ id: monitorId, slug: "with-deleted-alert", name: "With deleted alert" }))
      await database.db.insert(monitorAlertsTable).values([
        makeAlertRow({ id: generateId(), monitorId, severity: "high" }),
        makeAlertRow({
          id: generateId(),
          monitorId,
          severity: "low",
          deletedAt: new Date("2026-05-29T11:00:00.000Z"),
        }),
      ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      const monitor = result.items[0] as Monitor
      expect(monitor.alerts.map((a) => a.severity)).toEqual(["high"])
    })

    it("does not return monitors from a different organization (RLS)", async () => {
      const ownId = generateId()
      const otherId = generateId()

      await database.db.insert(monitorsTable).values([
        makeMonitorRow({ id: ownId, slug: "own", name: "Own" }),
        makeMonitorRow({
          id: otherId,
          slug: "other",
          name: "Other",
          organizationId: otherOrganizationId,
          projectId: otherProjectId,
        }),
      ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(result.items.map((m) => m.slug)).toEqual(["own"])
    })
  })

  describe("findBySlug", () => {
    it("returns a monitor and its alerts when the slug matches", async () => {
      const monitorId = generateId()
      await database.db
        .insert(monitorsTable)
        .values(makeMonitorRow({ id: monitorId, slug: "issue-discovered", name: "Issue discovered" }))
      await database.db
        .insert(monitorAlertsTable)
        .values([makeAlertRow({ id: generateId(), monitorId, kind: "issue.new", sourceType: "issue", sourceId: null })])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.findBySlug({ projectId, slug: "issue-discovered" })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(result.slug).toBe("issue-discovered")
      expect(result.alerts.length).toBe(1)
      expect(result.alerts[0]?.source).toEqual({ type: "issue", id: null })
    })

    it("treats soft-deleted rows as not found", async () => {
      const monitorId = generateId()
      await database.db.insert(monitorsTable).values(
        makeMonitorRow({
          id: monitorId,
          slug: "deleted",
          name: "Deleted",
          deletedAt: new Date("2026-05-29T11:00:00.000Z"),
        }),
      )

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.findBySlug({ projectId, slug: "deleted" })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(Exit.isFailure(exit)).toBe(true)
    })
  })

  describe("schema constraints", () => {
    it("rejects duplicate (project_id, slug) among non-deleted rows", async () => {
      const firstId = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id: firstId, slug: "dup", name: "First" }))

      await expect(
        database.db.insert(monitorsTable).values(makeMonitorRow({ id: generateId(), slug: "dup", name: "Second" })),
      ).rejects.toThrow()
    })

    it("allows reusing a slug once the previous row is soft-deleted", async () => {
      const firstId = generateId()
      await database.db.insert(monitorsTable).values(
        makeMonitorRow({
          id: firstId,
          slug: "reusable",
          name: "First",
          deletedAt: new Date("2026-05-29T11:00:00.000Z"),
        }),
      )

      await expect(
        database.db
          .insert(monitorsTable)
          .values(makeMonitorRow({ id: generateId(), slug: "reusable", name: "Second" })),
      ).resolves.toBeDefined()
    })
  })
})
