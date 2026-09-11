import { FLAGGER_STRATEGY_SLUGS, type FlaggerSlug } from "@domain/flaggers"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { provisionFlaggersForAllProjects } from "./provision-flaggers-backfill.ts"
import { flaggers } from "./schema/flaggers.ts"
import { projects } from "./schema/projects.ts"
import { setupTestPostgres } from "./test/in-memory-postgres.ts"

const ORG_ID = "org-provision-backfill".padEnd(24, "x").slice(0, 24)
const LIVE_PROJECT = "project-provision-live".padEnd(24, "x").slice(0, 24)
const DELETED_PROJECT = "project-provision-gone".padEnd(24, "x").slice(0, 24)

const pg = setupTestPostgres()

const insertProject = (id: string, slug: string, deletedAt: Date | null) =>
  pg.db.insert(projects).values({ id, organizationId: ORG_ID, name: slug, slug, deletedAt })

describe("provisionFlaggersForAllProjects", () => {
  beforeEach(async () => {
    await pg.db.delete(flaggers)
    await pg.db.delete(projects)
    await insertProject(LIVE_PROJECT, "live", null)
    await insertProject(DELETED_PROJECT, "gone", new Date())
  })

  it("provisions every registered slug for a live project and skips deleted ones", async () => {
    const result = await provisionFlaggersForAllProjects(pg.adminPostgresClient)

    expect(result).toMatchObject({ projectCount: 1, failedProjectIds: [] })

    const rows = await pg.db.select().from(flaggers).where(eq(flaggers.projectId, LIVE_PROJECT))
    expect(rows.map((row) => row.slug).sort()).toEqual([...FLAGGER_STRATEGY_SLUGS].sort())
    expect(rows.every((row) => row.enabled)).toBe(true)

    const deletedRows = await pg.db.select().from(flaggers).where(eq(flaggers.projectId, DELETED_PROJECT))
    expect(deletedRows).toHaveLength(0)
  })

  // The backfill runs after a deploy that ships a slug, on projects that already
  // configured the others. It must add the missing row without reopening a
  // detector the project turned off or resetting a tuned sampling rate.
  it("leaves an existing row's enabled state and sampling alone", async () => {
    await pg.db.insert(flaggers).values({
      id: "flagger-existing".padEnd(24, "0").slice(0, 24),
      organizationId: ORG_ID,
      projectId: LIVE_PROJECT,
      slug: "refusal" as FlaggerSlug,
      enabled: false,
      sampling: 73,
    })

    await provisionFlaggersForAllProjects(pg.adminPostgresClient)

    const [refusal] = await pg.db.select().from(flaggers).where(eq(flaggers.slug, "refusal"))
    expect(refusal).toMatchObject({ enabled: false, sampling: 73 })

    const taskSuccess = await pg.db.select().from(flaggers).where(eq(flaggers.slug, "task-success"))
    expect(taskSuccess).toHaveLength(1)
  })

  it("is idempotent across re-runs", async () => {
    await provisionFlaggersForAllProjects(pg.adminPostgresClient)
    const afterFirst = await pg.db.select().from(flaggers)

    const rerun = await provisionFlaggersForAllProjects(pg.adminPostgresClient)
    const afterSecond = await pg.db.select().from(flaggers)

    expect(rerun.provisionedCount).toBe(0)
    expect(afterSecond).toHaveLength(afterFirst.length)
  })
})
