import {
  type Incident,
  type IncidentRepository,
  IncidentRepository as IncidentRepositoryTag,
  incidentSchema,
} from "@domain/incidents"
import { AlertIncidentId, generateId, MonitorId, OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { incidents } from "../schema/alert-incidents.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { IncidentRepositoryLive } from "./alert-incident-repository.ts"

const ORG_ID = OrganizationId("a".repeat(24))
const OTHER_ORG_ID = OrganizationId("b".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))
const MONITOR_ID = MonitorId("m".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, IncidentRepository | SqlClient>, org: OrganizationId = ORG_ID) =>
  Effect.runPromise(effect.pipe(withPostgres(IncidentRepositoryLive, pg.adminPostgresClient, org)))

const makeIncident = (overrides: Partial<Incident> = {}): Incident =>
  incidentSchema.parse({
    id: AlertIncidentId(generateId()),
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    sourceType: "monitor",
    sourceId: MONITOR_ID,
    severity: "medium",
    startedAt: new Date("2026-06-23T10:00:00.000Z"),
    endedAt: null,
    createdAt: new Date("2026-06-23T10:01:00.000Z"),
    entrySignals: null,
    exitEligibleSince: null,
    condition: {
      trigger: "threshold",
      metric: { kind: "count" },
      threshold: { mode: "absolute", value: 10 },
    },
    ...overrides,
  })

afterEach(async () => {
  await pg.db.delete(incidents)
})

describe("IncidentRepositoryLive", () => {
  it("inserts and finds incidents in the current org scope", async () => {
    const incident = makeIncident()

    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* IncidentRepositoryTag
        yield* repo.insert(incident)
        return yield* repo.findById(incident.id)
      }),
    )

    expect(found).toEqual(incident)
  })

  it("closes only the open incident for the producer in the current org", async () => {
    const mine = makeIncident()
    const otherOrg = makeIncident({ id: AlertIncidentId(generateId()), organizationId: OTHER_ORG_ID })

    const closedId = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* IncidentRepositoryTag
        yield* repo.insert(mine)
        yield* repo.insert(otherOrg).pipe(withPostgres(IncidentRepositoryLive, pg.adminPostgresClient, OTHER_ORG_ID))
        return yield* repo.closeOpen({
          sourceType: "monitor",
          sourceId: MONITOR_ID,
          endedAt: new Date("2026-06-23T11:00:00.000Z"),
        })
      }),
    )

    expect(closedId).toBe(mine.id)

    const all = await pg.db.select().from(incidents)
    expect(all.find((row) => row.id === mine.id)?.endedAt).toEqual(new Date("2026-06-23T11:00:00.000Z"))
    expect(all.find((row) => row.id === otherOrg.id)?.endedAt).toBeNull()
  })

  it("updates exit dwell and returns monitor pagination stats", async () => {
    const first = makeIncident({ startedAt: new Date("2026-06-23T09:00:00.000Z") })
    const second = makeIncident({
      id: AlertIncidentId(generateId()),
      startedAt: new Date("2026-06-23T10:00:00.000Z"),
      endedAt: new Date("2026-06-23T10:30:00.000Z"),
    })
    const dwell = new Date("2026-06-23T10:45:00.000Z")

    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* IncidentRepositoryTag
        yield* repo.insert(first)
        yield* repo.insert(second)
        yield* repo.updateExitDwell({ id: first.id, exitEligibleSince: dwell })
        return {
          open: yield* repo.findOpen({ sourceType: "monitor", sourceId: MONITOR_ID }),
          page: yield* repo.listByMonitorId({ monitorId: MONITOR_ID, limit: 1 }),
          stats: yield* repo.statsByMonitorId(MONITOR_ID),
        }
      }),
    )

    expect(result.open?.exitEligibleSince).toEqual(dwell)
    expect(result.page.items).toHaveLength(1)
    expect(result.page.hasMore).toBe(true)
    expect(result.stats.total).toBe(2)
    expect(result.stats.firstStartedAt).toEqual(first.startedAt)
    expect(result.stats.lastIncidentId).toBe(first.id)
  })
})
