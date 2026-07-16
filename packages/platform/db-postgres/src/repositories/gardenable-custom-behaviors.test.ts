import { beforeAll, describe, expect, it } from "vitest"
import { customBehaviors } from "../schema/custom-behaviors.ts"
import { projects } from "../schema/projects.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { listGardenableCustomBehaviors } from "./gardenable-custom-behaviors.ts"

const pg = setupTestPostgres()

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = makeId("org-cbgarden")
const REAL = makeId("proj-cb-real")
const DEMO = makeId("proj-cb-demo")
const DELETED = makeId("proj-cb-del")

const NOW = new Date("2026-06-01T12:00:00.000Z")
const GARDENED_BEFORE = new Date("2026-06-01T00:00:00.000Z")

const ELIGIBLE_NEW = makeId("cb-eligible-new")
const ELIGIBLE_STALE = makeId("cb-eligible-stale")
const RECENT = makeId("cb-recent")
const ON_DEMO = makeId("cb-on-demo")
const ON_DELETED = makeId("cb-on-deleted")

const behaviorRow = (id: string, projectId: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organizationId: ORG,
  projectId,
  name: id,
  slug: id,
  filterSet: { moments: [{ op: "in" as const, value: ["escalation"] }] },
  status: "ready" as const,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

describe("listGardenableCustomBehaviors", () => {
  beforeAll(async () => {
    await pg.db.insert(projects).values([
      { id: REAL, organizationId: ORG, name: "Real", slug: "cb-real", createdAt: NOW, updatedAt: NOW },
      {
        id: DEMO,
        organizationId: ORG,
        name: "Sample",
        slug: "cb-demo",
        settings: { isSample: true },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: DELETED,
        organizationId: ORG,
        name: "Deleted",
        slug: "cb-deleted",
        deletedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    await pg.db
      .insert(customBehaviors)
      .values([
        behaviorRow(ELIGIBLE_NEW, REAL, { lastGardenedAt: null }),
        behaviorRow(ELIGIBLE_STALE, REAL, { lastGardenedAt: new Date("2026-05-20T00:00:00.000Z") }),
        behaviorRow(RECENT, REAL, { lastGardenedAt: new Date("2026-06-01T06:00:00.000Z") }),
        behaviorRow(ON_DEMO, DEMO),
        behaviorRow(ON_DELETED, DELETED),
      ])
  })

  it("returns never-gardened and past-throttle behaviors on live, non-demo projects only", async () => {
    const ids = (await listGardenableCustomBehaviors(pg.adminPostgresClient, { gardenedBefore: GARDENED_BEFORE })).map(
      (row) => row.custom_behavior_id,
    )

    // Never gardened (null) and gardened before the throttle window are eligible.
    expect(ids).toContain(ELIGIBLE_NEW)
    expect(ids).toContain(ELIGIBLE_STALE)
    // Recently gardened (within the throttle) and behaviors on demo /
    // soft-deleted projects are all excluded.
    expect(ids).not.toContain(RECENT)
    expect(ids).not.toContain(ON_DEMO)
    expect(ids).not.toContain(ON_DELETED)
  })
})
