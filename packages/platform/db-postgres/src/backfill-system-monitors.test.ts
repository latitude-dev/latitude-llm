import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { monitorAlerts as monitorAlertsTable } from "./schema/monitor-alerts.ts"
import { monitors as monitorsTable } from "./schema/monitors.ts"
import { projects as projectsTable } from "./schema/projects.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "./test/in-memory-postgres.ts"

const DRIZZLE_DIR = fileURLToPath(new URL("../drizzle", import.meta.url))

const loadBackfillSql = (): string => {
  const dir = readdirSync(DRIZZLE_DIR).find((name) => name.endsWith("_backfill-system-monitors"))
  if (!dir) throw new Error("backfill-system-monitors migration folder not found")
  return readFileSync(`${DRIZZLE_DIR}/${dir}/migration.sql`, "utf8")
}

const organizationId = "o".repeat(24)
const projectA = "a".repeat(24)
const projectB = "b".repeat(24)

// The backfill is owner-level data SQL (it runs cross-org during a migration),
// so this test exercises it the same way: raw exec on the admin connection,
// against seeded projects, asserting the per-project fan-out + idempotency.
describe("backfill-system-monitors migration", () => {
  let database: InMemoryPostgres
  const backfillSql = loadBackfillSql()

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })

  beforeEach(async () => {
    await database.db.delete(monitorAlertsTable)
    await database.db.delete(monitorsTable)
    await database.db.delete(projectsTable)
  })

  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  const seedProjects = async (ids: readonly string[]) => {
    await database.db
      .insert(projectsTable)
      .values(ids.map((id) => ({ id, organizationId, name: `Project ${id}`, slug: id })))
  }

  const monitorsForProject = (projectId: string) =>
    database.db.select().from(monitorsTable).where(eq(monitorsTable.projectId, projectId))

  it("provisions the three system monitors, with alerts, for every existing project", async () => {
    await seedProjects([projectA, projectB])
    await database.client.exec(backfillSql)

    for (const projectId of [projectA, projectB]) {
      const rows = await monitorsForProject(projectId)
      expect(rows.map((r) => r.slug).sort()).toEqual(["issue-discovered", "issue-escalating", "issue-regressed"])
      expect(rows.every((r) => r.system && r.deletedAt === null && r.mutedAt === null)).toBe(true)

      const escalating = rows.find((r) => r.slug === "issue-escalating")
      const [escalatingAlert] = await database.db
        .select()
        .from(monitorAlertsTable)
        .where(eq(monitorAlertsTable.monitorId, escalating?.id ?? ""))
      expect(escalatingAlert).toMatchObject({
        kind: "issue.escalating",
        sourceType: "issue",
        sourceId: null,
        severity: "high",
        condition: { kind: "issue.escalating", sensitivity: 3 },
      })

      const discovered = rows.find((r) => r.slug === "issue-discovered")
      const [discoveredAlert] = await database.db
        .select()
        .from(monitorAlertsTable)
        .where(eq(monitorAlertsTable.monitorId, discovered?.id ?? ""))
      expect(discoveredAlert).toMatchObject({ kind: "issue.new", severity: "medium", condition: null })
    }
  })

  it("is idempotent — re-running inserts no duplicate monitors or alerts", async () => {
    await seedProjects([projectA])
    await database.client.exec(backfillSql)
    await database.client.exec(backfillSql)

    const rows = await monitorsForProject(projectA)
    expect(rows.length).toBe(3)

    const alerts = await database.db
      .select()
      .from(monitorAlertsTable)
      .where(and(eq(monitorAlertsTable.organizationId, organizationId)))
    expect(alerts.length).toBe(3)
  })
})
