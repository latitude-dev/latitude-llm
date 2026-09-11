import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { CUID_LENGTH } from "@domain/shared"
import { eq, sql } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { flaggers } from "../schema/flaggers.ts"
import { projects } from "../schema/projects.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"

const MIGRATION_SQL = readFileSync(
  fileURLToPath(new URL("../../drizzle/20260911083346_provision-task-failure-flagger/migration.sql", import.meta.url)),
  "utf8",
)

const ORG_ID = "org-task-failure-backfill".padEnd(24, "x").slice(0, 24)
const LIVE_PROJECT = "project-backfill-live".padEnd(24, "x").slice(0, 24)
const DELETED_PROJECT = "project-backfill-gone".padEnd(24, "x").slice(0, 24)

const pg = setupTestPostgres()

// Replaying the migration is what the test exercises: the harness applies it at
// setup, before any project exists, so re-running it against seeded rows is the
// only way to see it actually insert. It is written to be replay-safe.
const runMigration = () => pg.db.execute(sql.raw(MIGRATION_SQL))

describe("provision-task-failure-flagger migration", () => {
  beforeEach(async () => {
    await pg.db.delete(flaggers)
    await pg.db.delete(projects)
    await pg.db.insert(projects).values([
      { id: LIVE_PROJECT, organizationId: ORG_ID, name: "live", slug: "live", deletedAt: null },
      { id: DELETED_PROJECT, organizationId: ORG_ID, name: "gone", slug: "gone", deletedAt: new Date() },
    ])
  })

  it("gives every live project an enabled row at the default sampling rate", async () => {
    await runMigration()

    const rows = await pg.db.select().from(flaggers).where(eq(flaggers.slug, "task-failure"))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ projectId: LIVE_PROJECT, organizationId: ORG_ID, enabled: true, sampling: 10 })
    expect(rows[0]?.id).toHaveLength(CUID_LENGTH)
    expect(rows[0]?.id).toMatch(/^[a-z][a-z0-9]{23}$/)
  })

  it("skips deleted projects", async () => {
    await runMigration()

    const rows = await pg.db.select().from(flaggers).where(eq(flaggers.projectId, DELETED_PROJECT))

    expect(rows).toHaveLength(0)
  })

  it("leaves a project that already configured the judge untouched", async () => {
    await pg.db.insert(flaggers).values({
      id: "flagger-preconfigured".padEnd(24, "0").slice(0, 24),
      organizationId: ORG_ID,
      projectId: LIVE_PROJECT,
      slug: "task-failure",
      enabled: false,
      sampling: 73,
    })

    await runMigration()

    const rows = await pg.db.select().from(flaggers).where(eq(flaggers.slug, "task-failure"))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ enabled: false, sampling: 73 })
  })

  it("adds nothing on a replay", async () => {
    await runMigration()
    const afterFirst = await pg.db.select().from(flaggers)

    await runMigration()
    const afterSecond = await pg.db.select().from(flaggers)

    expect(afterSecond).toHaveLength(afterFirst.length)
    expect(afterSecond[0]?.id).toBe(afterFirst[0]?.id)
  })
})
