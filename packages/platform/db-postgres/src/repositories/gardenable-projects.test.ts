import { beforeAll, describe, expect, it } from "vitest"
import { projects } from "../schema/projects.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { listGardenableProjectRefs } from "./gardenable-projects.ts"

const pg = setupTestPostgres()

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = makeId("org-garden")
const REAL = makeId("proj-real")
const DEMO = makeId("proj-demo")
const DELETED = makeId("proj-deleted")
const NO_SETTINGS = makeId("proj-nosettings")
const NOT_SAMPLE = makeId("proj-notsample")

describe("listGardenableProjectRefs", () => {
  beforeAll(async () => {
    const now = new Date("2026-06-01T12:00:00.000Z")
    await pg.db.insert(projects).values([
      { id: REAL, organizationId: ORG, name: "Real", slug: "real", createdAt: now, updatedAt: now },
      {
        id: DEMO,
        organizationId: ORG,
        name: "Sample project",
        slug: "sample",
        settings: { isSample: true },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: DELETED,
        organizationId: ORG,
        name: "Deleted",
        slug: "deleted",
        deletedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: NO_SETTINGS,
        organizationId: ORG,
        name: "No settings",
        slug: "no-settings",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: NOT_SAMPLE,
        organizationId: ORG,
        name: "Not sample",
        slug: "not-sample",
        settings: { isSample: false },
        createdAt: now,
        updatedAt: now,
      },
    ])
  })

  it("excludes demo (isSample) and soft-deleted projects, keeps everything else", async () => {
    const ids = (await listGardenableProjectRefs(pg.adminPostgresClient)).map((row) => row.project_id)

    // Real projects are gardened — including those with null settings or isSample:false.
    expect(ids).toContain(REAL)
    expect(ids).toContain(NO_SETTINGS)
    expect(ids).toContain(NOT_SAMPLE)
    // Demo projects and soft-deleted projects are never gardened.
    expect(ids).not.toContain(DEMO)
    expect(ids).not.toContain(DELETED)
  })
})
