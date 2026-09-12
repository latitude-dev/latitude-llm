import { FlaggerRepository, type FlaggerSlug } from "@domain/flaggers"
import { OrganizationId, ProjectId, type SqlClient } from "@domain/shared"
import { eq } from "drizzle-orm"
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

const insertRawRow = (slug: string, idSuffix: string, sampling = 10) =>
  pg.db.insert(flaggers).values({
    id: `flagger-${idSuffix}`.padEnd(24, "0").slice(0, 24),
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    slug: slug as FlaggerSlug,
    enabled: true,
    sampling,
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

  it("listByProject still fails when a recognized slug has an invalid sampling value", async () => {
    await insertRawRow("frustration", "bad-sampling", 101)

    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* FlaggerRepository
          return yield* repo.listByProject({ projectId: PROJECT_ID })
        }),
      ),
    ).rejects.toThrow()
  })
})

describe("derived sampling", () => {
  beforeEach(async () => {
    await pg.db.delete(flaggers)
  })

  const samplingOf = (slug: string) =>
    pg.db
      .select({ sampling: flaggers.sampling, source: flaggers.samplingSource })
      .from(flaggers)
      .where(eq(flaggers.slug, slug as FlaggerSlug))
      .then((rows) => rows[0])

  const applyDerived = (rates: readonly { slug: string; sampling: number }[]) =>
    runWithLive(
      Effect.gen(function* () {
        const repository = yield* FlaggerRepository
        return yield* repository.applyDerivedSampling({
          projectId: PROJECT_ID,
          rates: rates.map((rate) => ({ slug: rate.slug as FlaggerSlug, sampling: rate.sampling })),
        })
      }),
    )

  it("writes the derived rate onto a row nobody has touched", async () => {
    await insertRawRow("task-failure", "derived-default")

    expect(await applyDerived([{ slug: "task-failure", sampling: 40 }])).toBe(1)
    expect(await samplingOf("task-failure")).toEqual({ sampling: 40, source: "derived" })
  })

  it("leaves a rate somebody chose alone", async () => {
    await insertRawRow("task-failure", "derived-user")
    await runWithLive(
      Effect.gen(function* () {
        const repository = yield* FlaggerRepository
        return yield* repository.update({ projectId: PROJECT_ID, slug: "task-failure" as FlaggerSlug, sampling: 5 })
      }),
    )

    // A rate somebody set is a decision, not a starting point.
    expect(await applyDerived([{ slug: "task-failure", sampling: 40 }])).toBe(0)
    expect(await samplingOf("task-failure")).toEqual({ sampling: 5, source: "user" })
  })

  it("keeps overwriting its own previous derivation as traffic moves", async () => {
    await insertRawRow("jailbreaking", "derived-again")
    await applyDerived([{ slug: "jailbreaking", sampling: 40 }])

    expect(await applyDerived([{ slug: "jailbreaking", sampling: 12 }])).toBe(1)
    expect(await samplingOf("jailbreaking")).toEqual({ sampling: 12, source: "derived" })
  })

  it("reports how many rows it changed, not how many it was asked about", async () => {
    await insertRawRow("task-failure", "derived-count")

    expect(
      await applyDerived([
        { slug: "task-failure", sampling: 40 },
        { slug: "pii-leakage", sampling: 40 },
      ]),
    ).toBe(1)
  })

  it("only enables the rate change, never the flagger itself", async () => {
    await insertRawRow("task-failure", "derived-enabled")
    await applyDerived([{ slug: "task-failure", sampling: 40 }])

    const [row] = await pg.db
      .select()
      .from(flaggers)
      .where(eq(flaggers.slug, "task-failure" as FlaggerSlug))
    expect(row?.enabled).toBe(true)
  })
})
