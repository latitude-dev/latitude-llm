import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url))
const MIGRATION_SQL = readFileSync(
  `${MIGRATIONS_FOLDER}/20261001101132_add-outbox-partial-indexes/migration.sql`,
  "utf8",
)
const STATEMENTS = MIGRATION_SQL.split("--> statement-breakpoint")
const ASSERTION_SQL = STATEMENTS[2]
if (!ASSERTION_SQL) throw new Error("Missing outbox index assertion statement")
const INDEXES = [
  { name: "outbox_events_unpublished_idx", column: "created_at", published: false },
  { name: "outbox_events_published_at_idx", column: "published_at", published: true },
] as const

const readIndexes = (database: PGlite) =>
  database.query<{ name: string; oid: number; key: string; predicate: string }>(`
    SELECT c.relname AS name, c.oid, pg_get_indexdef(c.oid, 1, true) AS key,
           pg_get_expr(i.indpred, i.indrelid) AS predicate
    FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
    WHERE i.indrelid = 'latitude.outbox_events'::regclass
      AND c.relname IN ('outbox_events_unpublished_idx', 'outbox_events_published_at_idx')
    ORDER BY c.relname;
  `)

const expectIndexes = async (database: PGlite) => {
  const result = await readIndexes(database)
  expect(result.rows).toEqual([
    {
      name: "outbox_events_published_at_idx",
      oid: expect.any(Number),
      key: "published_at",
      predicate: "(published = true)",
    },
    {
      name: "outbox_events_unpublished_idx",
      oid: expect.any(Number),
      key: "created_at",
      predicate: "(published = false)",
    },
  ])
}

it("creates the indexes and records history on a fresh database through the real migrator", async () => {
  const database = new PGlite({ extensions: { vector } })
  try {
    await database.exec("CREATE ROLE latitude_app NOLOGIN; SET search_path TO latitude, public;")
    await migrate(drizzle({ client: database }), { migrationsFolder: MIGRATIONS_FOLDER })
    await expectIndexes(database)
    const history = await database.query<{ created_at: number; hash: string }>(
      "SELECT created_at, hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    )
    expect(Number(history.rows[0]?.created_at)).toBe(Date.UTC(2026, 9, 1, 10, 11, 32))
    expect(history.rows[0]?.hash).toBe(createHash("sha256").update(MIGRATION_SQL).digest("hex"))
  } finally {
    await database.close()
  }
}, 30_000)

describe("add outbox partial indexes migration", () => {
  let database: PGlite

  beforeEach(async () => {
    database = new PGlite()
    await database.exec(`
      CREATE SCHEMA latitude;
      CREATE TABLE latitude.outbox_events (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz,
        published boolean NOT NULL DEFAULT false
      );
    `)
  })

  afterEach(async () => {
    await database.close()
  })

  const runMigration = () =>
    database.transaction(async (transaction) => {
      for (const statement of STATEMENTS) await transaction.exec(statement)
    })

  it("creates both absent indexes transactionally", async () => {
    await runMigration()
    await expectIndexes(database)
  })

  it("preserves matching precreated indexes and accepts a replay", async () => {
    await database.exec(`
      CREATE INDEX outbox_events_unpublished_idx ON latitude.outbox_events (created_at) WHERE published = false;
      CREATE INDEX outbox_events_published_at_idx ON latitude.outbox_events (published_at ASC NULLS LAST) WHERE published = true;
    `)
    const before = await readIndexes(database)
    await runMigration()
    await runMigration()
    expect((await readIndexes(database)).rows).toEqual(before.rows)
    await expectIndexes(database)
  })

  it("rejects absent indexes in the standalone operator gate without creating them", async () => {
    await expect(database.exec(ASSERTION_SQL)).rejects.toThrow("Outbox index outbox_events_unpublished_idx")
    expect((await readIndexes(database)).rows).toEqual([])
    await database.exec(
      "CREATE INDEX outbox_events_unpublished_idx ON latitude.outbox_events (created_at) WHERE published = false;",
    )
    await expect(database.exec(ASSERTION_SQL)).rejects.toThrow("Outbox index outbox_events_published_at_idx")
    expect((await readIndexes(database)).rows).toHaveLength(1)
    await runMigration()
    await database.exec(ASSERTION_SQL)
  })

  it("holds a table ShareLock until commit even when both index statements skip", async () => {
    await runMigration()
    await database.transaction(async (transaction) => {
      for (const statement of STATEMENTS) await transaction.exec(statement)
      const locks = await transaction.query<{ mode: string; granted: boolean }>(`
        SELECT mode, granted FROM pg_locks
        WHERE relation = 'latitude.outbox_events'::regclass AND pid = pg_backend_pid();
      `)
      expect(locks.rows).toContainEqual({ mode: "ShareLock", granted: true })
    })
  })

  describe.each(INDEXES)("$name", ({ name, column, published }) => {
    const variants = [
      {
        label: "wrong timestamp key",
        definition: `(${column === "created_at" ? "published_at" : "created_at"}) WHERE published = ${published}`,
      },
      { label: "descending key", definition: `(${column} DESC) WHERE published = ${published}` },
      { label: "ascending nulls first", definition: `(${column} ASC NULLS FIRST) WHERE published = ${published}` },
      { label: "included column", definition: `(${column}) INCLUDE (id) WHERE published = ${published}` },
      { label: "extra key", definition: `(${column}, id) WHERE published = ${published}` },
      {
        label: "expression key",
        definition: `((coalesce(${column}, 'epoch'::timestamptz))) WHERE published = ${published}`,
      },
      { label: "wrong predicate", definition: `(${column}) WHERE published = ${!published}` },
      { label: "no predicate", definition: `(${column})` },
      { label: "extra predicate", definition: `(${column}) WHERE published = ${published} AND id IS NOT NULL` },
      { label: "different boolean expression", definition: `(${column}) WHERE published IS ${published}` },
    ]

    it.each(variants)("rejects $label without leaving the other index behind", async ({ definition }) => {
      await database.exec(`CREATE INDEX ${name} ON latitude.outbox_events ${definition};`)
      await expect(runMigration()).rejects.toThrow(
        `Outbox index ${name} is missing, invalid, or has an unexpected definition`,
      )
      expect((await readIndexes(database)).rows).toHaveLength(1)
    })

    it("rejects a unique index", async () => {
      await database.exec(
        `CREATE UNIQUE INDEX ${name} ON latitude.outbox_events (${column}) WHERE published = ${published};`,
      )
      await expect(runMigration()).rejects.toThrow(`Outbox index ${name}`)
    })

    it("rejects a different access method", async () => {
      await database.exec(
        `CREATE INDEX ${name} ON latitude.outbox_events USING brin (${column}) WHERE published = ${published};`,
      )
      await expect(runMigration()).rejects.toThrow(`Outbox index ${name}`)
    })

    it("rejects a nondefault timestamp operator class", async () => {
      await database.exec(`
        CREATE OPERATOR CLASS latitude.custom_timestamptz_ops FOR TYPE timestamptz USING btree AS
          OPERATOR 1 < (timestamptz, timestamptz),
          OPERATOR 2 <= (timestamptz, timestamptz),
          OPERATOR 3 = (timestamptz, timestamptz),
          OPERATOR 4 >= (timestamptz, timestamptz),
          OPERATOR 5 > (timestamptz, timestamptz),
          FUNCTION 1 timestamptz_cmp(timestamptz, timestamptz);
        CREATE INDEX ${name} ON latitude.outbox_events (${column} latitude.custom_timestamptz_ops)
          WHERE published = ${published};
      `)
      await expect(runMigration()).rejects.toThrow(`Outbox index ${name}`)
    })

    it("rejects an index on a different table", async () => {
      await database.exec(`
        CREATE TABLE latitude.other_outbox (LIKE latitude.outbox_events);
        CREATE INDEX ${name} ON latitude.other_outbox (${column}) WHERE published = ${published};
      `)
      await expect(runMigration()).rejects.toThrow(`Outbox index ${name}`)
    })

    it("rejects a same-name non-index object", async () => {
      await database.exec(`CREATE TABLE latitude.${name} (id text);`)
      await expect(runMigration()).rejects.toThrow(`Outbox index ${name}`)
    })

    it("rejects a timestamp without time zone", async () => {
      await database.exec(`
        ALTER TABLE latitude.outbox_events ALTER COLUMN ${column} TYPE timestamp;
        CREATE INDEX ${name} ON latitude.outbox_events (${column}) WHERE published = ${published};
      `)
      await expect(runMigration()).rejects.toThrow(`Outbox index ${name}`)
    })

    it.each(["indisvalid", "indisready", "indislive"])("rejects a catalog index with %s false", async (flag) => {
      await database.exec(`
        CREATE INDEX ${name} ON latitude.outbox_events (${column}) WHERE published = ${published};
        SET allow_system_table_mods = on;
        UPDATE pg_catalog.pg_index SET ${flag} = false WHERE indexrelid = 'latitude.${name}'::regclass;
      `)
      const state = await database.query<{ enabled: boolean }>(
        `SELECT ${flag} AS enabled FROM pg_catalog.pg_index WHERE indexrelid = 'latitude.${name}'::regclass`,
      )
      expect(state.rows).toEqual([{ enabled: false }])
      await expect(runMigration()).rejects.toThrow(`Outbox index ${name}`)
    })
  })
})
