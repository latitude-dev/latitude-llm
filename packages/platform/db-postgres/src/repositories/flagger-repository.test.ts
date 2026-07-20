import { FlaggerRepository, type FlaggerSlug } from "@domain/flaggers"
import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { flaggers } from "../schema/flaggers.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { FlaggerRepositoryLive } from "./flagger-repository.ts"

const ORG_ID = OrganizationId("org-flagger-repo-test".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("project-flagger-repo".padEnd(24, "x").slice(0, 24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, FlaggerRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(FlaggerRepositoryLive, pg.adminPostgresClient, ORG_ID)))

// Simulates a row written by a backfill migration for a strategy slug this build's
// FLAGGER_STRATEGY_SLUGS doesn't recognize yet (see 20260716185032_backfill-new-flagger-slugs).
const insertRawRow = (slug: string, idSuffix: string) =>
  pg.db.insert(flaggers).values({
    id: `flagger-${idSuffix}`.padEnd(24, "0").slice(0, 24),
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    slug: slug as FlaggerSlug,
    enabled: true,
    sampling: 10,
  })

describe("FlaggerRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(flaggers)
  })

  it("listByProject skips rows with a slug unrecognized by this build instead of failing the whole list", async () => {
    await insertRawRow("frustration", "known")
    await insertRawRow("some-future-strategy", "unknown")

    const rows = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FlaggerRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }),
    )

    expect(rows.map((row) => row.slug)).toEqual(["frustration"])
  })

  it("findByProjectAndSlug returns null for a row whose slug this build doesn't recognize", async () => {
    await insertRawRow("some-future-strategy", "unknown2")

    const row = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* FlaggerRepository
        return yield* repo.findByProjectAndSlug({ projectId: PROJECT_ID, slug: "some-future-strategy" as FlaggerSlug })
      }),
    )

    expect(row).toBeNull()
  })
})
