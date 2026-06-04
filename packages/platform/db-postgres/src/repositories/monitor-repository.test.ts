import { type Monitor, type MonitorAlert, MonitorRepository, type MonitorRepositoryShape } from "@domain/monitors"
import {
  type AlertIncidentCondition,
  AlertIncidentId,
  type AlertSeverity,
  generateId,
  MonitorAlertId,
  MonitorId,
  OrganizationId,
  ProjectId,
  type SqlClient,
} from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { alertIncidents as alertIncidentsTable } from "../schema/alert-incidents.ts"
import { monitorAlerts as monitorAlertsTable } from "../schema/monitor-alerts.ts"
import { monitors as monitorsTable } from "../schema/monitors.ts"
import { projects as projectsTable } from "../schema/projects.ts"
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
    await database.db.delete(alertIncidentsTable)
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

      expect(result).toEqual({
        items: [],
        lastIncidentByMonitorId: new Map(),
        totalCount: 0,
        hasMore: false,
        limit: 50,
        offset: 0,
      })
    })

    it("orders by createdAt desc when no monitor has incidents (system monitors are not pinned)", async () => {
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

      expect(result.items.map((m) => m.slug)).toEqual(["user-newer", "user-older", "issue-discovered"])
      expect(result.totalCount).toBe(3)
    })

    it("orders by latest incident desc (no-incident monitors last, createdAt as tiebreak) and returns the map", async () => {
      const systemId = generateId()
      const recentId = generateId()
      const olderId = generateId()
      const noIncidentId = generateId()
      const recentAlertId = generateId()
      const olderAlertId = generateId()

      await database.db.insert(monitorsTable).values([
        makeMonitorRow({ id: systemId, slug: "issue-discovered", name: "Issue discovered", system: true }),
        makeMonitorRow({
          id: noIncidentId,
          slug: "no-incident",
          name: "No incident",
          createdAt: new Date("2026-05-31T10:00:00.000Z"),
        }),
        makeMonitorRow({
          id: recentId,
          slug: "recent",
          name: "Recent",
          createdAt: new Date("2026-05-28T10:00:00.000Z"),
        }),
        makeMonitorRow({
          id: olderId,
          slug: "older",
          name: "Older",
          createdAt: new Date("2026-05-29T10:00:00.000Z"),
        }),
      ])
      await database.db
        .insert(monitorAlertsTable)
        .values([
          makeAlertRow({ id: recentAlertId, monitorId: recentId }),
          makeAlertRow({ id: olderAlertId, monitorId: olderId }),
        ])

      const recentStartedAt = new Date("2026-06-01T09:00:00.000Z")
      const olderStartedAt = new Date("2026-05-20T09:00:00.000Z")
      const olderEndedAt = new Date("2026-05-20T11:00:00.000Z")
      await database.db.insert(alertIncidentsTable).values([
        {
          id: AlertIncidentId(generateId()),
          organizationId: organizationId as string,
          projectId: projectId as string,
          sourceType: "savedSearch",
          sourceId: "s".repeat(24),
          kind: "savedSearch.match",
          severity: "medium",
          startedAt: new Date("2026-05-25T09:00:00.000Z"),
          endedAt: new Date("2026-05-25T10:00:00.000Z"),
          monitorAlertId: recentAlertId,
        },
        {
          id: AlertIncidentId(generateId()),
          organizationId: organizationId as string,
          projectId: projectId as string,
          sourceType: "savedSearch",
          sourceId: "s".repeat(24),
          kind: "savedSearch.match",
          severity: "medium",
          startedAt: recentStartedAt,
          endedAt: null,
          monitorAlertId: recentAlertId,
        },
        {
          id: AlertIncidentId(generateId()),
          organizationId: organizationId as string,
          projectId: projectId as string,
          sourceType: "savedSearch",
          sourceId: "s".repeat(24),
          kind: "savedSearch.match",
          severity: "medium",
          startedAt: olderStartedAt,
          endedAt: olderEndedAt,
          monitorAlertId: olderAlertId,
        },
        {
          // Closed but started AFTER the ongoing one — the ongoing incident still wins the
          // "last incident" pick (ended_at DESC NULLS FIRST), not the latest-started.
          id: AlertIncidentId(generateId()),
          organizationId: organizationId as string,
          projectId: projectId as string,
          sourceType: "savedSearch",
          sourceId: "s".repeat(24),
          kind: "savedSearch.match",
          severity: "medium",
          startedAt: new Date("2026-06-02T09:00:00.000Z"),
          endedAt: new Date("2026-06-02T09:30:00.000Z"),
          monitorAlertId: recentAlertId,
        },
      ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

      expect(result.items.map((m) => m.slug)).toEqual(["recent", "older", "no-incident", "issue-discovered"])
      expect(result.lastIncidentByMonitorId.get(recentId)).toEqual({ startedAt: recentStartedAt, endedAt: null })
      expect(result.lastIncidentByMonitorId.get(olderId)).toEqual({
        startedAt: olderStartedAt,
        endedAt: olderEndedAt,
      })
      expect(result.lastIncidentByMonitorId.has(noIncidentId)).toBe(false)
      expect(result.lastIncidentByMonitorId.has(systemId)).toBe(false)
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

  describe("provisionSystemMonitors", () => {
    const makeSystemMonitor = (
      slug: string,
      name: string,
      alert: { kind: MonitorAlert["kind"]; severity: AlertSeverity; condition: AlertIncidentCondition | null },
    ): Monitor => {
      const monitorId = MonitorId(generateId())
      const now = new Date("2026-06-01T10:00:00.000Z")
      return {
        id: monitorId,
        organizationId,
        projectId,
        slug,
        name,
        description: "",
        system: true,
        alerts: [
          {
            id: MonitorAlertId(generateId()),
            monitorId,
            kind: alert.kind,
            source: { type: "issue", id: null },
            condition: alert.condition,
            severity: alert.severity,
            createdAt: now,
          },
        ],
        mutedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    }

    // Mirrors SYSTEM_MONITOR_DEFINITIONS materialised by the provision use-case.
    const systemMonitors = (): Monitor[] => [
      makeSystemMonitor("issue-discovered", "Issue discovered", {
        kind: "issue.new",
        severity: "medium",
        condition: null,
      }),
      makeSystemMonitor("issue-regressed", "Issue regressed", {
        kind: "issue.regressed",
        severity: "high",
        condition: null,
      }),
      makeSystemMonitor("issue-escalating", "Issue escalating", {
        kind: "issue.escalating",
        severity: "high",
        condition: { kind: "issue.escalating", sensitivity: 3 },
      }),
    ]

    const provision = (monitors: readonly Monitor[]) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.provisionSystemMonitors(monitors)
        }).pipe(provideRls(database, organizationId)),
      )

    const list = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

    it("inserts all three monitors with their alerts on a fresh project", async () => {
      const inserted = await provision(systemMonitors())
      expect(inserted.map((m) => m.slug)).toEqual(["issue-discovered", "issue-regressed", "issue-escalating"])

      const page = await list()
      const bySlug = new Map(page.items.map((m) => [m.slug, m]))
      expect(page.totalCount).toBe(3)
      expect(bySlug.get("issue-discovered")?.alerts[0]).toMatchObject({ kind: "issue.new", severity: "medium" })
      expect(bySlug.get("issue-regressed")?.alerts[0]).toMatchObject({ kind: "issue.regressed", severity: "high" })
      expect(bySlug.get("issue-escalating")?.alerts[0]).toMatchObject({
        kind: "issue.escalating",
        severity: "high",
        condition: { kind: "issue.escalating", sensitivity: 3 },
      })
    })

    it("is idempotent — a second run inserts nothing and returns no monitors", async () => {
      await provision(systemMonitors())
      const secondRun = await provision(systemMonitors())

      expect(secondRun).toEqual([])
      const page = await list()
      expect(page.totalCount).toBe(3)
      expect(page.items.flatMap((m) => m.alerts).length).toBe(3)
    })
  })

  describe("resetSystemMonitors", () => {
    const makeSystemMonitor = (
      target: ProjectId,
      slug: string,
      name: string,
      alert: { kind: MonitorAlert["kind"]; severity: AlertSeverity; condition: AlertIncidentCondition | null },
    ): Monitor => {
      const monitorId = MonitorId(generateId())
      const now = new Date("2026-06-01T10:00:00.000Z")
      return {
        id: monitorId,
        organizationId,
        projectId: target,
        slug,
        name,
        description: `${name} description`,
        system: true,
        alerts: [
          {
            id: MonitorAlertId(generateId()),
            monitorId,
            kind: alert.kind,
            source: { type: "issue", id: null },
            condition: alert.condition,
            severity: alert.severity,
            createdAt: now,
          },
        ],
        mutedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    }

    const systemMonitors = (target: ProjectId = projectId): Monitor[] => [
      makeSystemMonitor(target, "issue-discovered", "Issue discovered", {
        kind: "issue.new",
        severity: "medium",
        condition: null,
      }),
      makeSystemMonitor(target, "issue-escalating", "Issue escalating", {
        kind: "issue.escalating",
        severity: "high",
        condition: { kind: "issue.escalating", sensitivity: 3 },
      }),
    ]

    const reset = (monitors: readonly Monitor[]) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.resetSystemMonitors(monitors)
        }).pipe(provideRls(database, organizationId)),
      )

    const list = (target: ProjectId = projectId) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.list({ projectId: target, limit: 50, offset: 0 })
        }).pipe(provideRls(database, organizationId)),
      )

    it("inserts the monitors with their alerts on a fresh project", async () => {
      const result = await reset(systemMonitors())
      expect(result.map((m) => m.slug)).toEqual(["issue-discovered", "issue-escalating"])

      const page = await list()
      expect(page.totalCount).toBe(2)
      const bySlug = new Map(page.items.map((m) => [m.slug, m]))
      expect(bySlug.get("issue-escalating")?.alerts[0]).toMatchObject({
        kind: "issue.escalating",
        condition: { kind: "issue.escalating", sensitivity: 3 },
      })
    })

    it("overwrites name/description and resets alert condition values on existing system monitors", async () => {
      await reset(systemMonitors())

      // Drift the live state: rename the monitor and slacken the escalation sensitivity.
      const before = await list()
      const escalating = before.items.find((m) => m.slug === "issue-escalating")
      await database.db
        .update(monitorsTable)
        .set({ name: "Renamed by user", description: "Edited" })
        .where(eq(monitorsTable.id, escalating?.id ?? ""))
      await database.db
        .update(monitorAlertsTable)
        .set({ condition: { kind: "issue.escalating", sensitivity: 10 } })
        .where(eq(monitorAlertsTable.monitorId, escalating?.id ?? ""))

      const result = await reset(systemMonitors())
      expect(result.length).toBe(2)

      const after = await list()
      expect(after.totalCount).toBe(2)
      const resetEscalating = after.items.find((m) => m.slug === "issue-escalating")
      expect(resetEscalating?.id).toBe(escalating?.id) // upsert keeps the existing row
      expect(resetEscalating?.name).toBe("Issue escalating")
      expect(resetEscalating?.description).toBe("Issue escalating description")
      expect(resetEscalating?.alerts.length).toBe(1) // old alert soft-deleted, fresh one inserted
      expect(resetEscalating?.alerts[0]).toMatchObject({ condition: { kind: "issue.escalating", sensitivity: 3 } })
    })

    it("preserves the mute state of an existing system monitor", async () => {
      await reset(systemMonitors())
      const before = await list()
      const discovered = before.items.find((m) => m.slug === "issue-discovered")
      const mutedAt = new Date("2026-06-01T12:00:00.000Z")
      await database.db
        .update(monitorsTable)
        .set({ mutedAt })
        .where(eq(monitorsTable.id, discovered?.id ?? ""))

      await reset(systemMonitors())

      const after = await list()
      const resetDiscovered = after.items.find((m) => m.slug === "issue-discovered")
      expect(resetDiscovered?.mutedAt).toEqual(mutedAt)
    })

    it("skips a slug already held by a user-created monitor", async () => {
      const userMonitorId = generateId()
      await database.db
        .insert(monitorsTable)
        .values(
          makeMonitorRow({ id: userMonitorId, slug: "issue-discovered", name: "My custom monitor", system: false }),
        )

      const result = await reset(systemMonitors())
      expect(result.map((m) => m.slug)).toEqual(["issue-escalating"])

      const page = await list()
      const discovered = page.items.find((m) => m.slug === "issue-discovered")
      expect(discovered?.id).toBe(userMonitorId)
      expect(discovered?.name).toBe("My custom monitor")
      expect(discovered?.system).toBe(false)
    })

    it("only touches the target project, leaving same-slug monitors on other projects alone", async () => {
      await reset(systemMonitors(otherProjectId))
      const otherBefore = await list(otherProjectId)
      const otherDiscovered = otherBefore.items.find((m) => m.slug === "issue-discovered")

      await reset(systemMonitors(projectId))

      const target = await list(projectId)
      expect(target.totalCount).toBe(2)
      const other = await list(otherProjectId)
      expect(other.items.find((m) => m.slug === "issue-discovered")?.id).toBe(otherDiscovered?.id)
    })
  })

  describe("mutations", () => {
    const exec = <A, E>(use: (repo: MonitorRepositoryShape) => Effect.Effect<A, E, SqlClient>) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* use(repository)
        }).pipe(provideRls(database, organizationId)),
      )

    const execExit = <A, E>(use: (repo: MonitorRepositoryShape) => Effect.Effect<A, E, SqlClient>) =>
      Effect.runPromiseExit(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* use(repository)
        }).pipe(provideRls(database, organizationId)),
      )

    it("setMuted sets muted_at on a live monitor", async () => {
      const id = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id, slug: "m", name: "M" }))
      await exec((r) => r.setMuted({ id: MonitorId(id), mutedAt: new Date("2026-06-02T00:00:00.000Z") }))

      const [row] = await database.db.select().from(monitorsTable).where(eq(monitorsTable.id, id))
      expect(row?.mutedAt).not.toBeNull()
    })

    it("setMuted fails NotFoundError for a missing monitor", async () => {
      const exit = await execExit((r) => r.setMuted({ id: MonitorId(generateId()), mutedAt: new Date() }))
      expect(Exit.isFailure(exit)).toBe(true)
    })

    it("softDelete marks the monitor and cascades deleted_at to its live alerts", async () => {
      const id = generateId()
      const aliveAlert = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id, slug: "m", name: "M" }))
      await database.db.insert(monitorAlertsTable).values(makeAlertRow({ id: aliveAlert, monitorId: id }))

      await exec((r) => r.softDelete(MonitorId(id)))

      const [monitorRow] = await database.db.select().from(monitorsTable).where(eq(monitorsTable.id, id))
      expect(monitorRow?.deletedAt).not.toBeNull()
      const [alertRow] = await database.db
        .select()
        .from(monitorAlertsTable)
        .where(eq(monitorAlertsTable.id, aliveAlert))
      expect(alertRow?.deletedAt).not.toBeNull()
    })

    it("updateMetadata updates name, slug and description", async () => {
      const id = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id, slug: "old", name: "Old" }))

      await exec((r) =>
        r.updateMetadata({ id: MonitorId(id), name: "New name", slug: "new-name", description: "Desc" }),
      )

      const [row] = await database.db.select().from(monitorsTable).where(eq(monitorsTable.id, id))
      expect(row).toMatchObject({ name: "New name", slug: "new-name", description: "Desc" })
    })

    it("updateAlert replaces an alert's kind, source, condition and severity", async () => {
      const id = generateId()
      const alert = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id, slug: "m", name: "M" }))
      await database.db.insert(monitorAlertsTable).values(
        makeAlertRow({
          id: alert,
          monitorId: id,
          kind: "savedSearch.threshold",
          sourceType: "savedSearch",
          sourceId: "s".repeat(24),
          condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
          severity: "medium",
        }),
      )

      await exec((r) =>
        r.updateAlert({
          alertId: MonitorAlertId(alert),
          kind: "savedSearch.escalating",
          sourceId: "t".repeat(24),
          condition: {
            kind: "savedSearch.escalating",
            threshold: { mode: "absolute", count: 250 },
            window: { minutes: 5 },
          },
          severity: "high",
        }),
      )

      const [row] = await database.db.select().from(monitorAlertsTable).where(eq(monitorAlertsTable.id, alert))
      expect(row).toMatchObject({
        kind: "savedSearch.escalating",
        sourceId: "t".repeat(24),
        severity: "high",
        condition: {
          kind: "savedSearch.escalating",
          threshold: { mode: "absolute", count: 250 },
          window: { minutes: 5 },
        },
      })
    })

    it("updateAlert fails NotFoundError for a missing alert", async () => {
      const exit = await execExit((r) =>
        r.updateAlert({
          alertId: MonitorAlertId(generateId()),
          kind: "issue.escalating",
          sourceId: null,
          condition: { kind: "issue.escalating", sensitivity: 4 },
          severity: "high",
        }),
      )
      expect(Exit.isFailure(exit)).toBe(true)
    })

    it("countActiveBySlug counts live same-slug monitors, excluding the target and soft-deleted rows", async () => {
      const liveA = generateId()
      const otherB = generateId()
      const ghost = generateId()
      await database.db.insert(monitorsTable).values([
        makeMonitorRow({ id: liveA, slug: "taken", name: "A" }),
        makeMonitorRow({ id: otherB, slug: "b-slug", name: "B" }),
        // Soft-deleted "taken" — allowed alongside the live one by the partial unique index.
        makeMonitorRow({ id: ghost, slug: "taken", name: "Ghost", deletedAt: new Date("2026-05-30T00:00:00.000Z") }),
      ])

      const countExcludingB = await exec((r) =>
        r.countActiveBySlug({ projectId, slug: "taken", excludeId: MonitorId(otherB) }),
      )
      expect(countExcludingB).toBe(1)

      const countExcludingA = await exec((r) =>
        r.countActiveBySlug({ projectId, slug: "taken", excludeId: MonitorId(liveA) }),
      )
      expect(countExcludingA).toBe(0)
    })

    const buildUserMonitor = (slug: string, alertCount: number): Monitor => {
      const monitorId = MonitorId(generateId())
      const now = new Date("2026-06-02T10:00:00.000Z")
      return {
        id: monitorId,
        organizationId,
        projectId,
        slug,
        name: slug,
        description: "",
        system: false,
        alerts: Array.from({ length: alertCount }, () => ({
          id: MonitorAlertId(generateId()),
          monitorId,
          kind: "savedSearch.match" as const,
          source: { type: "savedSearch" as const, id: "s".repeat(24) },
          condition: null,
          severity: "low" as const,
          createdAt: now,
        })),
        mutedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    }

    it("create inserts the monitor and its alerts atomically", async () => {
      const monitor = buildUserMonitor("created", 2)
      await exec((r) => r.create(monitor))

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.findBySlug({ projectId, slug: "created" })
        }).pipe(provideRls(database, organizationId)),
      )
      expect(result.id).toBe(monitor.id)
      expect(result.system).toBe(false)
      expect(result.alerts).toHaveLength(2)
    })

    it("insertAlert adds a live alert to an existing monitor", async () => {
      const id = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id, slug: "m", name: "M" }))
      await database.db.insert(monitorAlertsTable).values(makeAlertRow({ id: generateId(), monitorId: id }))

      await exec((r) =>
        r.insertAlert({
          id: MonitorAlertId(generateId()),
          monitorId: MonitorId(id),
          kind: "savedSearch.threshold",
          source: { type: "savedSearch", id: "s".repeat(24) },
          condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
          severity: "medium",
          createdAt: new Date("2026-06-02T10:00:00.000Z"),
        }),
      )

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.findById(MonitorId(id))
        }).pipe(provideRls(database, organizationId)),
      )
      expect(result.alerts.map((a) => a.kind).sort()).toEqual(["savedSearch.match", "savedSearch.threshold"])
    })

    it("softDeleteAlert sets deleted_at and drops the alert from reads", async () => {
      const id = generateId()
      const keep = generateId()
      const remove = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id, slug: "m", name: "M" }))
      await database.db
        .insert(monitorAlertsTable)
        .values([makeAlertRow({ id: keep, monitorId: id }), makeAlertRow({ id: remove, monitorId: id })])

      await exec((r) => r.softDeleteAlert(MonitorAlertId(remove)))

      const [removedRow] = await database.db.select().from(monitorAlertsTable).where(eq(monitorAlertsTable.id, remove))
      expect(removedRow?.deletedAt).not.toBeNull()

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.findById(MonitorId(id))
        }).pipe(provideRls(database, organizationId)),
      )
      expect(result.alerts.map((a) => a.id)).toEqual([keep])
    })

    it("softDeleteAlert fails NotFoundError for an already-deleted alert", async () => {
      const id = generateId()
      const alert = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id, slug: "m", name: "M" }))
      await database.db
        .insert(monitorAlertsTable)
        .values(makeAlertRow({ id: alert, monitorId: id, deletedAt: new Date("2026-06-02T09:00:00.000Z") }))

      const exit = await execExit((r) => r.softDeleteAlert(MonitorAlertId(alert)))
      expect(Exit.isFailure(exit)).toBe(true)
    })
  })

  describe("listActiveAlertsForSourceEvent", () => {
    const issueId = "i".repeat(24)

    const resolve = (input: { kind: MonitorAlert["kind"]; sourceId: string }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.listActiveAlertsForSourceEvent({
            projectId,
            kind: input.kind,
            sourceType: "issue",
            sourceId: input.sourceId,
          })
        }).pipe(provideRls(database, organizationId)),
      )

    it("matches a live all-source issue alert, scoped to the project", async () => {
      const here = generateId()
      await database.db
        .insert(monitorsTable)
        .values(makeMonitorRow({ id: here, slug: "here", name: "Here", system: true }))
      await database.db
        .insert(monitorAlertsTable)
        .values(
          makeAlertRow({ id: generateId(), monitorId: here, kind: "issue.new", sourceType: "issue", sourceId: null }),
        )

      // Same org, different project — must not match.
      const elsewhere = generateId()
      await database.db
        .insert(monitorsTable)
        .values(
          makeMonitorRow({ id: elsewhere, slug: "elsewhere", name: "Elsewhere", projectId: otherProjectId as string }),
        )
      await database.db.insert(monitorAlertsTable).values(
        makeAlertRow({
          id: generateId(),
          monitorId: elsewhere,
          kind: "issue.new",
          sourceType: "issue",
          sourceId: null,
        }),
      )

      const result = await resolve({ kind: "issue.new", sourceId: issueId })
      expect(result).toHaveLength(1)
      expect(result[0]?.kind).toBe("issue.new")
      expect(result[0]?.source).toEqual({ type: "issue", id: null })
    })

    it("excludes soft-deleted alerts and deleted monitors", async () => {
      const live = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id: live, slug: "live", name: "Live" }))
      await database.db.insert(monitorAlertsTable).values(
        makeAlertRow({
          id: generateId(),
          monitorId: live,
          kind: "issue.new",
          sourceType: "issue",
          sourceId: null,
          deletedAt: new Date(),
        }),
      )

      const gone = generateId()
      await database.db
        .insert(monitorsTable)
        .values(makeMonitorRow({ id: gone, slug: "gone", name: "Gone", deletedAt: new Date() }))
      await database.db
        .insert(monitorAlertsTable)
        .values(
          makeAlertRow({ id: generateId(), monitorId: gone, kind: "issue.new", sourceType: "issue", sourceId: null }),
        )

      expect(await resolve({ kind: "issue.new", sourceId: issueId })).toEqual([])
    })

    it("matches a named-source alert only for its own source id", async () => {
      const monitor = generateId()
      await database.db.insert(monitorsTable).values(makeMonitorRow({ id: monitor, slug: "scoped", name: "Scoped" }))
      await database.db.insert(monitorAlertsTable).values(
        makeAlertRow({
          id: generateId(),
          monitorId: monitor,
          kind: "issue.new",
          sourceType: "issue",
          sourceId: issueId,
        }),
      )

      expect(await resolve({ kind: "issue.new", sourceId: issueId })).toHaveLength(1)
      expect(await resolve({ kind: "issue.new", sourceId: "z".repeat(24) })).toEqual([])
    })
  })

  describe("saved-search firing reads", () => {
    const searchX = "x".repeat(24)
    const searchY = "y".repeat(24)
    const provideAdmin = (database: InMemoryPostgres) =>
      withPostgres(MonitorRepositoryLive, database.adminPostgresClient)

    it("listActiveSavedSearchAlerts returns only live savedSearch alerts in the project", async () => {
      const live = generateId()
      const otherProject = generateId()
      await database.db
        .insert(monitorsTable)
        .values([
          makeMonitorRow({ id: live, slug: "live", name: "Live" }),
          makeMonitorRow({ id: otherProject, slug: "other", name: "Other", projectId: otherProjectId as string }),
        ])
      await database.db.insert(monitorAlertsTable).values([
        makeAlertRow({ id: "1".repeat(24), monitorId: live, sourceId: searchX }),
        // soft-deleted alert — excluded.
        makeAlertRow({ id: "2".repeat(24), monitorId: live, sourceId: searchY, deletedAt: new Date() }),
        // issue-kind alert (different source type) — excluded.
        makeAlertRow({ id: "3".repeat(24), monitorId: live, kind: "issue.new", sourceType: "issue", sourceId: null }),
        // alert in another project — excluded.
        makeAlertRow({ id: "4".repeat(24), monitorId: otherProject, sourceId: searchX }),
      ])

      const alerts = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.listActiveSavedSearchAlerts(projectId)
        }).pipe(provideRls(database, organizationId)),
      )
      expect(alerts.map((a: MonitorAlert) => a.id)).toEqual([MonitorAlertId("1".repeat(24))])
    })

    it("listProjectsWithActiveSavedSearchAlerts returns distinct (org, project) pairs across orgs", async () => {
      const a = generateId()
      const b = generateId()
      const other = generateId()
      await database.db.insert(monitorsTable).values([
        makeMonitorRow({ id: a, slug: "a", name: "A" }),
        makeMonitorRow({ id: b, slug: "b", name: "B" }), // same org+project as a → de-duped
        makeMonitorRow({
          id: other,
          slug: "c",
          name: "C",
          organizationId: otherOrganizationId as string,
          projectId: otherProjectId as string,
        }),
      ])
      await database.db.insert(monitorAlertsTable).values([
        makeAlertRow({ id: "1".repeat(24), monitorId: a, sourceId: searchX }),
        makeAlertRow({ id: "2".repeat(24), monitorId: b, sourceId: searchY }),
        makeAlertRow({
          id: "3".repeat(24),
          monitorId: other,
          organizationId: otherOrganizationId as string,
          sourceId: searchX,
        }),
      ])

      const pairs = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.listProjectsWithActiveSavedSearchAlerts()
        }).pipe(provideAdmin(database)),
      )
      expect(pairs.map((p) => `${p.organizationId}:${p.projectId}`).sort()).toEqual(
        [`${organizationId}:${projectId}`, `${otherOrganizationId}:${otherProjectId}`].sort(),
      )
    })

    it("cascadeSourceDeletion soft-deletes matching alerts and prunes emptied monitors", async () => {
      const onlyX = generateId()
      const mixed = generateId()
      await database.db
        .insert(monitorsTable)
        .values([
          makeMonitorRow({ id: onlyX, slug: "only-x", name: "Only X" }),
          makeMonitorRow({ id: mixed, slug: "mixed", name: "Mixed" }),
        ])
      await database.db
        .insert(monitorAlertsTable)
        .values([
          makeAlertRow({ id: "1".repeat(24), monitorId: onlyX, sourceId: searchX }),
          makeAlertRow({ id: "2".repeat(24), monitorId: onlyX, sourceId: searchX }),
          makeAlertRow({ id: "3".repeat(24), monitorId: mixed, sourceId: searchX }),
          makeAlertRow({ id: "4".repeat(24), monitorId: mixed, sourceId: searchY }),
        ])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          return yield* repository.cascadeSourceDeletion({ sourceType: "savedSearch", sourceId: searchX })
        }).pipe(provideRls(database, organizationId)),
      )
      expect(result).toEqual({ deletedAlertCount: 3, deletedMonitorCount: 1 })

      const onlyXRow = await database.db.select().from(monitorsTable).where(eq(monitorsTable.id, onlyX))
      const mixedRow = await database.db.select().from(monitorsTable).where(eq(monitorsTable.id, mixed))
      expect(onlyXRow[0]?.deletedAt).not.toBeNull()
      expect(mixedRow[0]?.deletedAt).toBeNull()
    })
  })

  describe("soft-delete silently closes open incidents", () => {
    const alertId = MonitorAlertId("aa".padEnd(24, "0"))
    const openId = AlertIncidentId("1".repeat(24))
    const closedId = AlertIncidentId("2".repeat(24))
    const sourceId = "s".repeat(24)
    const priorEndedAt = new Date("2026-06-01T10:00:00.000Z")

    const incidentRow = (
      id: typeof openId,
      monitorAlertId: typeof alertId,
      endedAt: Date | null,
    ): typeof alertIncidentsTable.$inferInsert => ({
      id,
      organizationId: organizationId as string,
      projectId: projectId as string,
      sourceType: "savedSearch",
      sourceId,
      kind: "savedSearch.escalating",
      severity: "high",
      startedAt: new Date("2026-06-01T09:00:00.000Z"),
      endedAt,
      monitorAlertId,
    })

    const seed = async (monitorId: string) => {
      await database.db.insert(monitorsTable).values([makeMonitorRow({ id: monitorId, slug: "m", name: "M" })])
      await database.db.insert(monitorAlertsTable).values([makeAlertRow({ id: alertId, monitorId, sourceId })])
      await database.db
        .insert(alertIncidentsTable)
        .values([incidentRow(openId, alertId, null), incidentRow(closedId, alertId, priorEndedAt)])
    }

    const endedAtOf = async (id: typeof openId): Promise<Date | null> => {
      const rows = await database.db.select().from(alertIncidentsTable).where(eq(alertIncidentsTable.id, id))
      return rows[0]?.endedAt ?? null
    }

    it("softDeleteAlert closes the alert's open incident and leaves closed ones untouched", async () => {
      await seed(generateId())
      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          yield* repository.softDeleteAlert(alertId)
        }).pipe(provideRls(database, organizationId)),
      )
      expect(await endedAtOf(openId)).not.toBeNull()
      expect(await endedAtOf(closedId)).toEqual(priorEndedAt)
    })

    it("softDelete (monitor) closes open incidents of its cascaded alerts", async () => {
      const monitorId = generateId()
      await seed(monitorId)
      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          yield* repository.softDelete(MonitorId(monitorId))
        }).pipe(provideRls(database, organizationId)),
      )
      expect(await endedAtOf(openId)).not.toBeNull()
    })

    it("cascadeSourceDeletion closes open incidents of the soft-deleted alerts", async () => {
      await seed(generateId())
      await Effect.runPromise(
        Effect.gen(function* () {
          const repository = yield* MonitorRepository
          yield* repository.cascadeSourceDeletion({ sourceType: "savedSearch", sourceId })
        }).pipe(provideRls(database, organizationId)),
      )
      expect(await endedAtOf(openId)).not.toBeNull()
    })
  })
})

describe("MonitorRepositoryLive searchOrgWide", () => {
  let database: InMemoryPostgres

  const searchOrgId = OrganizationId("org-mon-search-test")
  const otherOrgId = OrganizationId("org-mon-search-other")
  const projA = ProjectId("proj-mon-search-a")
  const projB = ProjectId("proj-mon-search-b")
  const projDeleted = ProjectId("proj-mon-search-del")
  const projOther = ProjectId("proj-mon-search-oth")

  const monId = (prefix: string) => prefix.padEnd(24, "x").slice(0, 24)

  beforeAll(async () => {
    database = await createInMemoryPostgres()
    const baseTime = new Date("2026-05-29T10:00:00.000Z")

    await database.db.insert(projectsTable).values([
      { id: projA, organizationId: searchOrgId, name: "Alpha Project", slug: "mon-alpha" },
      { id: projB, organizationId: searchOrgId, name: "Beta Project", slug: "mon-beta" },
      { id: projDeleted, organizationId: searchOrgId, name: "Gone Project", slug: "mon-gone", deletedAt: baseTime },
      { id: projOther, organizationId: otherOrgId, name: "Other Org Project", slug: "mon-other" },
    ])

    const monitorRow = (
      id: string,
      organizationId: OrganizationId,
      projectId: ProjectId,
      slug: string,
      name: string,
      extra: Partial<typeof monitorsTable.$inferInsert> = {},
    ): typeof monitorsTable.$inferInsert => ({
      id: monId(id),
      organizationId,
      projectId,
      slug,
      name,
      description: "",
      system: false,
      mutedAt: null,
      deletedAt: null,
      createdAt: baseTime,
      updatedAt: baseTime,
      ...extra,
    })

    await database.db
      .insert(monitorsTable)
      .values([
        monitorRow("msm1", searchOrgId, projA, "errors-a", "Payment Errors"),
        monitorRow("msm2", searchOrgId, projB, "errors-b", "Error Rate", { mutedAt: baseTime }),
        monitorRow("msm3", searchOrgId, projA, "latency", "Latency"),
        monitorRow("msm4", searchOrgId, projA, "errors-del", "Errors Deleted", { deletedAt: baseTime }),
        monitorRow("msm5", searchOrgId, projDeleted, "errors-gone", "Errors In Deleted Project"),
        monitorRow("msm6", otherOrgId, projOther, "errors-secret", "Errors Secret"),
      ])
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  const search = (args: {
    readonly searchQuery?: string
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* MonitorRepository
        return yield* repo.searchOrgWide(args)
      }).pipe(withPostgres(MonitorRepositoryLive, database.appPostgresClient, searchOrgId)),
    )

  it("matches monitors across multiple projects in the org and tags them with the project + status", async () => {
    const results = await search({ searchQuery: "error", limit: 25 })
    expect(results.map((r) => r.name).sort()).toEqual(["Error Rate", "Payment Errors"])
    const payment = results.find((r) => r.name === "Payment Errors")
    const errorRate = results.find((r) => r.name === "Error Rate")
    expect(payment).toMatchObject({ projectId: projA, projectSlug: "mon-alpha", projectName: "Alpha Project" })
    expect(errorRate?.projectSlug).toBe("mon-beta")
    expect(errorRate?.mutedAt).not.toBeNull()
  })

  it("excludes soft-deleted monitors, deleted projects, and other organizations", async () => {
    const results = await search({ searchQuery: "error", limit: 25 })
    const names = results.map((r) => r.name)
    expect(names).not.toContain("Errors Deleted")
    expect(names).not.toContain("Errors In Deleted Project")
    expect(names).not.toContain("Errors Secret")
  })

  it("respects the limit", async () => {
    const results = await search({ searchQuery: "error", limit: 1 })
    expect(results).toHaveLength(1)
  })

  it("orders by name-match quality first, then system monitors as a tiebreak", async () => {
    const t = new Date("2026-05-30T12:00:00.000Z")
    const mk = (id: string, slug: string, name: string, system: boolean): typeof monitorsTable.$inferInsert => ({
      id: monId(id),
      organizationId: searchOrgId,
      projectId: projA,
      slug,
      name,
      description: "",
      system,
      mutedAt: null,
      deletedAt: null,
      createdAt: t,
      updatedAt: t,
    })
    // Exact match must lead even though it's non-system; among the two equal-score prefix matches,
    // the system monitor wins the tiebreak.
    await database.db
      .insert(monitorsTable)
      .values([
        mk("mzm3", "zebra-user", "Zebra User", false),
        mk("mzm2", "zebra-system", "Zebra System", true),
        mk("mzm1", "zebra", "Zebra", false),
      ])

    const results = await search({ searchQuery: "zebra", limit: 25 })
    expect(results.map((r) => r.name)).toEqual(["Zebra", "Zebra System", "Zebra User"])
  })

  it("ranks the preferred project's monitors first, ahead of match quality", async () => {
    // For "error": "Error Rate" (project B) is a prefix match (higher score) than the substring
    // "Payment Errors" (project A). Preferring project A floats it above the better match.
    const preferA = await search({ searchQuery: "error", preferProjectId: projA, limit: 25 })
    expect(preferA[0]?.name).toBe("Payment Errors")
    expect(preferA[0]?.projectId).toBe(projA)
  })
})
