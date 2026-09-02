import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const MIGRATION_PATH = fileURLToPath(
  new URL("../../drizzle/20260901145537_add-signal-score-evidence/migration.sql", import.meta.url),
)

describe("add signal score evidence migration", () => {
  let database: PGlite

  beforeEach(async () => {
    database = new PGlite()
    await database.exec(`
      CREATE SCHEMA latitude;
      CREATE TABLE latitude.signals (id text PRIMARY KEY);
      INSERT INTO latitude.signals (id) VALUES ('existing-signal');
    `)
  })

  afterEach(async () => {
    await database.close()
  })

  it("backfills existing signals with non-null diagnostic evidence", async () => {
    await database.exec(await readFile(MIGRATION_PATH, "utf8"))

    const result = await database.query<{ score_evidence: unknown }>(
      "SELECT score_evidence FROM latitude.signals WHERE id = 'existing-signal'",
    )

    expect(result.rows).toEqual([{ score_evidence: [] }])
    await expect(
      database.query("UPDATE latitude.signals SET score_evidence = NULL WHERE id = 'existing-signal'"),
    ).rejects.toThrow()
  })
})
