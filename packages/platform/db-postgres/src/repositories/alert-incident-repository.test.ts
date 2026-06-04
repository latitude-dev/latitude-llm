import { type AlertIncident, AlertIncidentRepository } from "@domain/alerts"
import { AlertIncidentId, MonitorAlertId, MonitorId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { alertIncidents as alertIncidentsTable } from "../schema/alert-incidents.ts"
import { monitorAlerts as monitorAlertsTable } from "../schema/monitor-alerts.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AlertIncidentRepositoryLive } from "./alert-incident-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("p".repeat(24))
const projectId = ProjectId("a".repeat(24))

const baseFields = {
  organizationId: organizationId as string,
  projectId: projectId as string,
  sourceType: "issue" as const,
  severity: "high" as const,
  entrySignals: null,
  exitEligibleSince: null,
}

const makeRow = (
  overrides: Partial<typeof alertIncidentsTable.$inferInsert>,
): typeof alertIncidentsTable.$inferInsert => ({
  ...baseFields,
  id: AlertIncidentId("a".repeat(24)),
  sourceId: "i".repeat(24),
  kind: "issue.escalating",
  startedAt: new Date("2026-05-07T10:00:00.000Z"),
  endedAt: null,
  createdAt: new Date("2026-05-07T10:00:00.000Z"),
  ...overrides,
})

const makeAlertRow = (
  overrides: Partial<typeof monitorAlertsTable.$inferInsert> & { id: string; monitorId: string },
): typeof monitorAlertsTable.$inferInsert => ({
  organizationId: organizationId as string,
  kind: "issue.new",
  sourceType: "issue",
  sourceId: null,
  condition: null,
  severity: "medium",
  createdAt: new Date("2026-05-07T09:00:00.000Z"),
  updatedAt: new Date("2026-05-07T09:00:00.000Z"),
  deletedAt: null,
  ...overrides,
})

// Admin client — `listOpenByKind` deliberately reads across orgs (sweep job)
// so RLS is bypassed. Matches the production wiring in `issues.ts`.
const makeProvider = (database: InMemoryPostgres) =>
  withPostgres(AlertIncidentRepositoryLive, database.adminPostgresClient)

// App-role client — RLS is enforced. The monitor read paths run on the
// non-admin client in production, so their tests run here to exercise both the
// explicit `organization_id` filter and the RLS policy.
const makeRlsProvider = (database: InMemoryPostgres, org: OrganizationId) =>
  withPostgres(AlertIncidentRepositoryLive, database.appPostgresClient, org)

describe("AlertIncidentRepositoryLive.listOpenByKind", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("returns only open rows matching the kind, across organizations, ordered by startedAt asc", async () => {
    const openA = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      startedAt: new Date("2026-05-07T10:00:00.000Z"),
    })
    const openB = makeRow({
      id: AlertIncidentId("2".repeat(24)),
      sourceId: "2".repeat(24),
      organizationId: otherOrganizationId,
      startedAt: new Date("2026-05-07T11:00:00.000Z"),
    })
    const closedC = makeRow({
      id: AlertIncidentId("3".repeat(24)),
      sourceId: "3".repeat(24),
      endedAt: new Date("2026-05-07T12:00:00.000Z"),
    })
    const otherKindD = makeRow({
      id: AlertIncidentId("4".repeat(24)),
      sourceId: "4".repeat(24),
      kind: "issue.regressed",
    })

    await database.db.insert(alertIncidentsTable).values([openA, openB, closedC, otherKindD])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listOpenByKind("issue.escalating")
      }).pipe(makeProvider(database)),
    )

    const ids = result.map((r: AlertIncident) => r.id)
    expect(ids).toEqual([AlertIncidentId("1".repeat(24)), AlertIncidentId("2".repeat(24))])
  })

  it("returns an empty list when no incidents match", async () => {
    await database.db.insert(alertIncidentsTable).values([
      makeRow({
        id: AlertIncidentId("5".repeat(24)),
        sourceId: "5".repeat(24),
        endedAt: new Date("2026-05-07T12:00:00.000Z"),
      }),
    ])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listOpenByKind("issue.escalating")
      }).pipe(makeProvider(database)),
    )

    expect(result).toEqual([])
  })
})

describe("AlertIncidentRepositoryLive.listByMonitorId", () => {
  let database: InMemoryPostgres
  const monitorIdA = MonitorId("a".repeat(24))
  const monitorIdB = MonitorId("b".repeat(24))
  // Alert A1 belongs to monitor A; alert B1 to monitor B. Incidents point at
  // alerts, and the repo joins through `monitor_alerts` to resolve the monitor.
  const alertA1 = MonitorAlertId("1a".padEnd(24, "0"))
  const alertA2Deleted = MonitorAlertId("2a".padEnd(24, "0"))
  const alertB1 = MonitorAlertId("1b".padEnd(24, "0"))

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
    await database.db.delete(monitorAlertsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("joins through monitor_alerts, ordered by endedAt desc (ongoing first)", async () => {
    await database.db
      .insert(monitorAlertsTable)
      .values([
        makeAlertRow({ id: alertA1, monitorId: monitorIdA }),
        makeAlertRow({ id: alertB1, monitorId: monitorIdB }),
      ])

    // startedAt deliberately disagrees with endedAt order to prove the sort keys off ended_at.
    const ongoing = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      monitorAlertId: alertA1,
      startedAt: new Date("2026-05-07T08:00:00.000Z"),
      endedAt: null,
    })
    const closedRecent = makeRow({
      id: AlertIncidentId("2".repeat(24)),
      sourceId: "2".repeat(24),
      monitorAlertId: alertA1,
      startedAt: new Date("2026-05-07T11:00:00.000Z"),
      endedAt: new Date("2026-05-07T12:00:00.000Z"),
    })
    const closedOld = makeRow({
      id: AlertIncidentId("3".repeat(24)),
      sourceId: "3".repeat(24),
      monitorAlertId: alertA1,
      startedAt: new Date("2026-05-07T09:00:00.000Z"),
      endedAt: new Date("2026-05-07T10:00:00.000Z"),
    })
    const otherMonitor = makeRow({
      id: AlertIncidentId("4".repeat(24)),
      sourceId: "4".repeat(24),
      monitorAlertId: alertB1,
      startedAt: new Date("2026-05-07T13:00:00.000Z"),
    })
    const noMonitor = makeRow({
      id: AlertIncidentId("5".repeat(24)),
      sourceId: "5".repeat(24),
    })

    await database.db.insert(alertIncidentsTable).values([ongoing, closedRecent, closedOld, otherMonitor, noMonitor])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listByMonitorId({ monitorId: monitorIdA, limit: 50 })
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(result.items.map((r: AlertIncident) => r.id)).toEqual([ongoing.id, closedRecent.id, closedOld.id])
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it("still returns incidents whose firing alert was soft-deleted", async () => {
    // The whole point of the join + soft-delete: removing an alert from a
    // monitor must not erase its incident history from the monitor's panel.
    await database.db
      .insert(monitorAlertsTable)
      .values([
        makeAlertRow({ id: alertA1, monitorId: monitorIdA }),
        makeAlertRow({ id: alertA2Deleted, monitorId: monitorIdA, deletedAt: new Date("2026-05-07T13:00:00.000Z") }),
      ])

    const live = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      monitorAlertId: alertA1,
      startedAt: new Date("2026-05-07T10:00:00.000Z"),
    })
    const fromDeletedAlert = makeRow({
      id: AlertIncidentId("2".repeat(24)),
      sourceId: "2".repeat(24),
      monitorAlertId: alertA2Deleted,
      startedAt: new Date("2026-05-07T11:00:00.000Z"),
    })

    await database.db.insert(alertIncidentsTable).values([live, fromDeletedAlert])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listByMonitorId({ monitorId: monitorIdA, limit: 50 })
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(result.items.map((r: AlertIncident) => r.id)).toEqual([fromDeletedAlert.id, live.id])
  })

  it("keyset-paginates: nextCursor walks the rest, no overlap", async () => {
    await database.db.insert(monitorAlertsTable).values([makeAlertRow({ id: alertA1, monitorId: monitorIdA })])
    await database.db.insert(alertIncidentsTable).values(
      Array.from({ length: 3 }, (_, i) =>
        makeRow({
          id: AlertIncidentId(String(i + 1).repeat(24)),
          sourceId: String(i + 1).repeat(24),
          monitorAlertId: alertA1,
          startedAt: new Date(2026, 4, 7, 10 + i),
        }),
      ),
    )

    const repository = AlertIncidentRepository
    const firstPage = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* repository).listByMonitorId({ monitorId: monitorIdA, limit: 2 })
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(firstPage.items.length).toBe(2)
    expect(firstPage.hasMore).toBe(true)
    expect(firstPage.nextCursor).not.toBeNull()

    const secondPage = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* repository).listByMonitorId({
          monitorId: monitorIdA,
          limit: 2,
          ...(firstPage.nextCursor ? { cursor: firstPage.nextCursor } : {}),
        })
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(secondPage.items.length).toBe(1)
    expect(secondPage.hasMore).toBe(false)
    expect(secondPage.nextCursor).toBeNull()
    // No overlap between pages.
    const firstIds = new Set(firstPage.items.map((r: AlertIncident) => r.id))
    expect(secondPage.items.every((r: AlertIncident) => !firstIds.has(r.id))).toBe(true)
  })

  it("does not return another organization's incidents (RLS + explicit org filter)", async () => {
    // Own alert under monitor A; a foreign-org alert reusing the same monitor
    // id. Only the org filter (RLS + explicit) keeps the foreign incident out.
    await database.db
      .insert(monitorAlertsTable)
      .values([
        makeAlertRow({ id: alertA1, monitorId: monitorIdA }),
        makeAlertRow({ id: alertB1, monitorId: monitorIdA, organizationId: otherOrganizationId }),
      ])

    const own = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      monitorAlertId: alertA1,
    })
    const foreign = makeRow({
      id: AlertIncidentId("2".repeat(24)),
      sourceId: "2".repeat(24),
      organizationId: otherOrganizationId,
      monitorAlertId: alertB1,
    })

    await database.db.insert(alertIncidentsTable).values([own, foreign])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listByMonitorId({ monitorId: monitorIdA, limit: 50 })
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(result.items.map((r: AlertIncident) => r.id)).toEqual([own.id])
  })
})

describe("AlertIncidentRepositoryLive.statsByMonitorId", () => {
  let database: InMemoryPostgres
  const monitorIdA = MonitorId("a".repeat(24))
  const monitorIdB = MonitorId("b".repeat(24))
  const alertA1 = MonitorAlertId("1a".padEnd(24, "0"))
  const alertA2Deleted = MonitorAlertId("2a".padEnd(24, "0"))
  const alertB1 = MonitorAlertId("1b".padEnd(24, "0"))

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
    await database.db.delete(monitorAlertsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("aggregates total + earliest/latest startedAt across the monitor's alerts (soft-deleted included)", async () => {
    await database.db
      .insert(monitorAlertsTable)
      .values([
        makeAlertRow({ id: alertA1, monitorId: monitorIdA }),
        makeAlertRow({ id: alertA2Deleted, monitorId: monitorIdA, deletedAt: new Date("2026-05-07T13:00:00.000Z") }),
        makeAlertRow({ id: alertB1, monitorId: monitorIdB }),
      ])

    await database.db.insert(alertIncidentsTable).values([
      makeRow({
        id: AlertIncidentId("1".repeat(24)),
        sourceId: "1".repeat(24),
        monitorAlertId: alertA1,
        startedAt: new Date("2026-05-07T10:00:00.000Z"),
      }),
      makeRow({
        id: AlertIncidentId("2".repeat(24)),
        sourceId: "2".repeat(24),
        monitorAlertId: alertA1,
        startedAt: new Date("2026-05-07T12:00:00.000Z"),
      }),
      // Soft-deleted alert's incident still counts toward history.
      makeRow({
        id: AlertIncidentId("3".repeat(24)),
        sourceId: "3".repeat(24),
        monitorAlertId: alertA2Deleted,
        startedAt: new Date("2026-05-07T09:00:00.000Z"),
      }),
      makeRow({
        id: AlertIncidentId("4".repeat(24)),
        sourceId: "4".repeat(24),
        monitorAlertId: alertB1,
        startedAt: new Date("2026-05-07T08:00:00.000Z"),
      }),
      makeRow({
        id: AlertIncidentId("5".repeat(24)),
        sourceId: "5".repeat(24),
        startedAt: new Date("2026-05-07T07:00:00.000Z"),
      }),
    ])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.statsByMonitorId(monitorIdA)
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(result.total).toBe(3)
    expect(result.firstStartedAt?.toISOString()).toBe("2026-05-07T09:00:00.000Z")
    expect(result.lastStartedAt?.toISOString()).toBe("2026-05-07T12:00:00.000Z")
  })

  it("returns zero/null for a monitor with no incidents", async () => {
    await database.db.insert(monitorAlertsTable).values([makeAlertRow({ id: alertA1, monitorId: monitorIdA })])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.statsByMonitorId(monitorIdA)
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(result.total).toBe(0)
    expect(result.firstStartedAt).toBeNull()
    expect(result.lastStartedAt).toBeNull()
  })
})

describe("AlertIncidentRepositoryLive.listByMonitorAlertId", () => {
  let database: InMemoryPostgres
  const alertA = MonitorAlertId("1a".padEnd(24, "0"))
  const alertB = MonitorAlertId("1b".padEnd(24, "0"))

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("returns only the given alert's incidents, ordered by endedAt desc", async () => {
    const newer = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      monitorAlertId: alertA,
      startedAt: new Date("2026-05-07T11:00:00.000Z"),
      endedAt: new Date("2026-05-07T12:00:00.000Z"),
    })
    const older = makeRow({
      id: AlertIncidentId("2".repeat(24)),
      sourceId: "2".repeat(24),
      monitorAlertId: alertA,
      startedAt: new Date("2026-05-07T10:00:00.000Z"),
      endedAt: new Date("2026-05-07T11:00:00.000Z"),
    })
    const otherAlert = makeRow({
      id: AlertIncidentId("3".repeat(24)),
      sourceId: "3".repeat(24),
      monitorAlertId: alertB,
    })

    // No monitor_alerts rows needed — this is a direct monitor_alert_id lookup.
    await database.db.insert(alertIncidentsTable).values([newer, older, otherAlert])

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.listByMonitorAlertId({ monitorAlertId: alertA, limit: 50 })
      }).pipe(makeRlsProvider(database, organizationId)),
    )

    expect(result.items.map((r: AlertIncident) => r.id)).toEqual([newer.id, older.id])
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })
})

describe("AlertIncidentRepositoryLive monitor-alert lookups (saved-search firing)", () => {
  let database: InMemoryPostgres
  const alertA = MonitorAlertId("1a".padEnd(24, "0"))
  const alertB = MonitorAlertId("1b".padEnd(24, "0"))

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(alertIncidentsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("findOpenByMonitorAlertId returns the open incident and null when only closed rows exist", async () => {
    const open = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      monitorAlertId: alertA,
      endedAt: null,
    })
    const closed = makeRow({
      id: AlertIncidentId("2".repeat(24)),
      sourceId: "2".repeat(24),
      monitorAlertId: alertB,
      endedAt: new Date("2026-05-07T12:00:00.000Z"),
    })
    // Another org's open row for the same alert id must stay invisible under RLS.
    const otherOrg = makeRow({
      id: AlertIncidentId("3".repeat(24)),
      sourceId: "3".repeat(24),
      organizationId: otherOrganizationId,
      monitorAlertId: alertA,
      endedAt: null,
    })
    await database.db.insert(alertIncidentsTable).values([open, closed, otherOrg])

    const found = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.findOpenByMonitorAlertId(alertA)
      }).pipe(makeRlsProvider(database, organizationId)),
    )
    expect(found?.id).toEqual(open.id)

    const none = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return yield* repository.findOpenByMonitorAlertId(alertB)
      }).pipe(makeRlsProvider(database, organizationId)),
    )
    expect(none).toBeNull()
  })

  it("existsByMonitorAlertId is true for any prior incident (open or closed)", async () => {
    await database.db.insert(alertIncidentsTable).values([
      makeRow({
        id: AlertIncidentId("1".repeat(24)),
        sourceId: "1".repeat(24),
        monitorAlertId: alertA,
        endedAt: new Date("2026-05-07T12:00:00.000Z"),
      }),
    ])

    const [spent, fresh] = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        return [
          yield* repository.existsByMonitorAlertId(alertA),
          yield* repository.existsByMonitorAlertId(alertB),
        ] as const
      }).pipe(makeRlsProvider(database, organizationId)),
    )
    expect(spent).toBe(true)
    expect(fresh).toBe(false)
  })

  it("setEndedAt closes a specific incident by id", async () => {
    const open = makeRow({
      id: AlertIncidentId("1".repeat(24)),
      sourceId: "1".repeat(24),
      monitorAlertId: alertA,
      endedAt: null,
    })
    await database.db.insert(alertIncidentsTable).values([open])

    const stillOpen = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* AlertIncidentRepository
        yield* repository.setEndedAt({ id: open.id as AlertIncidentId, endedAt: new Date("2026-05-07T13:00:00.000Z") })
        return yield* repository.findOpenByMonitorAlertId(alertA)
      }).pipe(makeRlsProvider(database, organizationId)),
    )
    expect(stillOpen).toBeNull()
  })
})
