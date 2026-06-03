import { IncidentMonitorReader } from "@domain/notifications"
import { generateId, OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { monitorAlerts as monitorAlertsTable } from "../schema/monitor-alerts.ts"
import { monitors as monitorsTable } from "../schema/monitors.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { IncidentMonitorReaderLive } from "./incident-monitor-reader.ts"

const organizationId = OrganizationId("o".repeat(24))
const otherOrganizationId = OrganizationId("p".repeat(24))
const projectId = ProjectId("a".repeat(24))
const at = new Date("2026-06-01T10:00:00.000Z")

const insertMonitorWithAlert = async (
  db: InMemoryPostgres,
  input: { alertId: string; mutedAt?: Date | null; alertDeletedAt?: Date | null; org?: OrganizationId },
) => {
  const org = (input.org ?? organizationId) as string
  const monitorId = generateId()
  await db.db.insert(monitorsTable).values({
    id: monitorId,
    organizationId: org,
    projectId: projectId as string,
    slug: `monitor-${monitorId.slice(0, 6)}`,
    name: "Issue discovered",
    description: "",
    system: true,
    mutedAt: input.mutedAt ?? null,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  })
  await db.db.insert(monitorAlertsTable).values({
    id: input.alertId,
    organizationId: org,
    monitorId,
    kind: "issue.new",
    sourceType: "issue",
    sourceId: null,
    condition: null,
    severity: "medium",
    deletedAt: input.alertDeletedAt ?? null,
    createdAt: at,
  })
  return { monitorId }
}

const findByAlertId = (database: InMemoryPostgres, alertId: string, org: OrganizationId = organizationId) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const reader = yield* IncidentMonitorReader
      return yield* reader.findByAlertId(alertId)
    }).pipe(withPostgres(IncidentMonitorReaderLive, database.appPostgresClient, org)),
  )

describe("IncidentMonitorReaderLive", () => {
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

  it("resolves the owning monitor's identity + mute state for a live alert", async () => {
    const alertId = generateId()
    const { monitorId } = await insertMonitorWithAlert(database, { alertId, mutedAt: at })

    const result = await findByAlertId(database, alertId)
    expect(result).toEqual({ monitorId, slug: expect.any(String), name: "Issue discovered", mutedAt: at })
  })

  it("resolves a soft-deleted alert so incident history stays attributable", async () => {
    const alertId = generateId()
    const { monitorId } = await insertMonitorWithAlert(database, { alertId, alertDeletedAt: at })

    const result = await findByAlertId(database, alertId)
    expect(result?.monitorId).toBe(monitorId)
    expect(result?.mutedAt).toBeNull()
  })

  it("returns null for an unknown alert id", async () => {
    expect(await findByAlertId(database, generateId())).toBeNull()
  })

  it("does not resolve an alert belonging to another organization (RLS)", async () => {
    const alertId = generateId()
    await insertMonitorWithAlert(database, { alertId, org: otherOrganizationId })

    expect(await findByAlertId(database, alertId, organizationId)).toBeNull()
  })
})
