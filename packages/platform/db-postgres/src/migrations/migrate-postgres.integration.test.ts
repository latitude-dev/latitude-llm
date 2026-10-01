import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { migratePostgres } from "./migrate-postgres.ts"

const TEST_URL = process.env.OUTBOX_TEST_DATABASE_URL
if (TEST_URL && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(TEST_URL).hostname)) {
  throw new Error("Outbox integration tests require an explicitly configured loopback disposable PostgreSQL server")
}
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url))
const OUTBOX_MIGRATION = "20261001101132_add-outbox-partial-indexes"
const INDEXES = [
  { name: "outbox_events_unpublished_idx", column: "created_at", published: false },
  { name: "outbox_events_published_at_idx", column: "published_at", published: true },
] as const

const waitFor = async (check: () => Promise<boolean>) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("Timed out waiting for PostgreSQL concurrent index build")
}

describe.skipIf(!TEST_URL)("real PostgreSQL migration deployment", () => {
  let admin: pg.Client
  let client: pg.Client
  let connectionString: string
  let databaseName: string
  let folder: string
  const connections: pg.Client[] = []

  beforeEach(async () => {
    admin = new pg.Client({ connectionString: TEST_URL })
    await admin.connect()
    databaseName = `automated_outbox_${randomUUID().replaceAll("-", "")}`
    await admin.query(`CREATE DATABASE "${databaseName}"`)
    const url = new URL(TEST_URL ?? "")
    url.pathname = `/${databaseName}`
    connectionString = url.toString()
    client = new pg.Client({ connectionString })
    await client.connect()
    folder = await mkdtemp(join(tmpdir(), "outbox-migrations-"))
  })

  afterEach(async () => {
    await Promise.all(connections.splice(0).map((connection) => connection.end()))
    await client.end()
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
    await admin.end()
    await rm(folder, { recursive: true, force: true })
  })

  const connect = async () => {
    const connection = new pg.Client({ connectionString })
    await connection.connect()
    connections.push(connection)
    return connection
  }
  const fixture = async (name: string, sql: string) => {
    await mkdir(join(folder, name))
    await writeFile(join(folder, name, "migration.sql"), sql)
  }
  const deploy = (migrationsFolder = folder) =>
    migratePostgres({ connectionString, migrationConfig: { migrationsFolder } })
  const setupTable = () =>
    client.query(`CREATE SCHEMA latitude;
      CREATE TABLE latitude.outbox_events (
        id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz, published boolean NOT NULL DEFAULT false
      );
      INSERT INTO latitude.outbox_events (id, published, published_at)
      SELECT n::text, n % 2 = 0, now() FROM generate_series(1, 1000) n;`)
  const indexes = () =>
    client.query<{ name: string; oid: number; healthy: boolean }>(`
      SELECT c.relname AS name, c.oid, i.indisvalid AND i.indisready AND i.indislive AS healthy
      FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
      WHERE c.relname IN ('outbox_events_unpublished_idx', 'outbox_events_published_at_idx') ORDER BY c.relname`)
  const history = () => client.query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at")
  const copyOutbox = async () =>
    fixture(OUTBOX_MIGRATION, await readFile(join(MIGRATIONS_FOLDER, OUTBOX_MIGRATION, "migration.sql"), "utf8"))

  it("supports a fresh database through the entire unchanged history and repeated deployment", async () => {
    await deploy(MIGRATIONS_FOLDER)
    expect((await indexes()).rows).toHaveLength(2)
    expect((await indexes()).rows.every((index) => index.healthy)).toBe(true)
    const before = (await history()).rows
    await deploy(MIGRATIONS_FOLDER)
    expect((await history()).rows).toEqual(before)
    const sql = await readFile(join(MIGRATIONS_FOLDER, OUTBOX_MIGRATION, "migration.sql"), "utf8")
    expect(before.at(-1)).toEqual({
      created_at: String(Date.UTC(2026, 9, 1, 10, 11, 32)),
      hash: createHash("sha256").update(sql).digest("hex"),
    })
  }, 30_000)

  it("builds both indexes concurrently before the old migration on a populated upgrade", async () => {
    for (const name of await readdir(MIGRATIONS_FOLDER)) {
      if (name >= OUTBOX_MIGRATION || name.startsWith(".")) continue
      await fixture(name, await readFile(join(MIGRATIONS_FOLDER, name, "migration.sql"), "utf8"))
    }
    await migrate(drizzle({ client }), { migrationsFolder: folder })
    await client.query(`INSERT INTO latitude.outbox_events
      (id, event_name, aggregate_id, workspace_id, payload, occurred_at)
      VALUES ('populated', 'Test', 'aggregate', 1, '{}', now())`)
    await client.query(`CREATE TABLE public.index_build_audit (query text);
      CREATE FUNCTION public.audit_index_build() RETURNS event_trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO public.index_build_audit VALUES (current_query()); END $$;
      CREATE EVENT TRIGGER audit_index_build ON ddl_command_end WHEN TAG IN ('CREATE INDEX')
      EXECUTE FUNCTION public.audit_index_build();`)
    await copyOutbox()
    await deploy()
    const builds = (await client.query<{ query: string }>("SELECT query FROM public.index_build_audit")).rows
    for (const index of INDEXES) {
      expect(builds.some((build) => build.query.startsWith(`CREATE INDEX CONCURRENTLY "${index.name}"`))).toBe(true)
    }
    expect((await indexes()).rows.every((index) => index.healthy)).toBe(true)
    const before = (await indexes()).rows
    await deploy()
    expect((await indexes()).rows).toEqual(before)
  }, 30_000)

  it("allows concurrent writes while the preflight waits for a writer", async () => {
    await setupTable()
    await copyOutbox()
    const writer = await connect()
    await writer.query("BEGIN; INSERT INTO latitude.outbox_events (id) VALUES ('held-writer')")
    const deployment = deploy()
    await waitFor(async () => (await client.query("SELECT 1 FROM pg_stat_progress_create_index")).rowCount === 1)
    await client.query("INSERT INTO latitude.outbox_events (id) VALUES ('concurrent-write')")
    await writer.query("COMMIT")
    await deployment
    expect((await indexes()).rows.every((index) => index.healthy)).toBe(true)
  })

  it.each(
    INDEXES,
  )("repairs an actually interrupted build of $name, including after history is applied", async (index) => {
    await setupTable()
    await copyOutbox()
    await deploy()
    await client.query(`DROP INDEX latitude.${index.name}`)
    const reader = await connect()
    await reader.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT * FROM latitude.outbox_events LIMIT 1")
    const builder = await connect()
    const { rows } = await builder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    const build = builder
      .query(
        `CREATE INDEX CONCURRENTLY ${index.name} ON latitude.outbox_events (${index.column}) WHERE published = ${index.published}`,
      )
      .then(
        () => null,
        (error: unknown) => error,
      )
    await waitFor(
      async () =>
        (
          await client.query(
            "SELECT 1 FROM pg_stat_progress_create_index WHERE pid = $1 AND phase = 'waiting for old snapshots'",
            [rows[0]?.pid],
          )
        ).rowCount === 1,
    )
    await client.query("SELECT pg_cancel_backend($1)", [rows[0]?.pid])
    expect(await build).toMatchObject({ code: "57014" })
    expect((await indexes()).rows.find((item) => item.name === index.name)?.healthy).toBe(false)
    await reader.query("ROLLBACK")
    const before = (await history()).rows
    await deploy()
    expect((await indexes()).rows.every((item) => item.healthy)).toBe(true)
    expect((await history()).rows).toEqual(before)
  })

  describe.each(INDEXES)("$name catalog validation", (index) => {
    const definitions = [
      {
        label: "wrong key",
        sql: `(${index.column === "created_at" ? "published_at" : "created_at"}) WHERE published = ${index.published}`,
      },
      { label: "descending key", sql: `(${index.column} DESC) WHERE published = ${index.published}` },
      { label: "nulls first", sql: `(${index.column} NULLS FIRST) WHERE published = ${index.published}` },
      { label: "included column", sql: `(${index.column}) INCLUDE (id) WHERE published = ${index.published}` },
      { label: "extra key", sql: `(${index.column}, id) WHERE published = ${index.published}` },
      {
        label: "expression",
        sql: `((coalesce(${index.column}, 'epoch'::timestamptz))) WHERE published = ${index.published}`,
      },
      { label: "wrong predicate", sql: `(${index.column}) WHERE published = ${!index.published}` },
      { label: "no predicate", sql: `(${index.column})` },
      { label: "different boolean expression", sql: `(${index.column}) WHERE published IS ${index.published}` },
      { label: "different method", sql: `USING brin (${index.column}) WHERE published = ${index.published}` },
    ]
    it.each(definitions)("rejects $label before altering either index or history", async ({ sql }) => {
      await setupTable()
      await copyOutbox()
      await client.query(`CREATE INDEX ${index.name} ON latitude.outbox_events ${sql}`)
      const before = (await indexes()).rows
      await expect(deploy()).rejects.toThrow("unexpected definition")
      expect((await indexes()).rows).toEqual(before)
      expect(
        (await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS history")).rows[0]?.history,
      ).toBeNull()
    })
    it("rejects a unique index", async () => {
      await setupTable()
      await client.query("TRUNCATE latitude.outbox_events")
      await client.query(
        `CREATE UNIQUE INDEX ${index.name} ON latitude.outbox_events (${index.column}) WHERE published = ${index.published}`,
      )
      await expect(deploy()).rejects.toThrow("unexpected definition")
    })
    it("rejects a matching-looking index on a different table", async () => {
      await setupTable()
      await client.query(`CREATE TABLE latitude.other_outbox (LIKE latitude.outbox_events);
        CREATE INDEX ${index.name} ON latitude.other_outbox (${index.column}) WHERE published = ${index.published}`)
      await expect(deploy()).rejects.toThrow("unexpected definition")
    })
  })

  it("repairs a canceled build that has not reached readiness, then completes pending history", async () => {
    await setupTable()
    await copyOutbox()
    const writer = await connect()
    await writer.query("BEGIN; INSERT INTO latitude.outbox_events (id) VALUES ('held')")
    const builder = await connect()
    const { rows } = await builder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    const build = builder
      .query(
        "CREATE INDEX CONCURRENTLY outbox_events_unpublished_idx ON latitude.outbox_events (created_at) WHERE published = false",
      )
      .then(
        () => null,
        (error: unknown) => error,
      )
    await waitFor(
      async () =>
        (
          await client.query(
            "SELECT 1 FROM pg_stat_progress_create_index WHERE pid = $1 AND phase = 'waiting for writers before build'",
            [rows[0]?.pid],
          )
        ).rowCount === 1,
    )
    await client.query("SELECT pg_cancel_backend($1)", [rows[0]?.pid])
    expect(await build).toMatchObject({ code: "57014" })
    expect(
      (
        await client.query(
          "SELECT indisready FROM pg_index WHERE indexrelid = 'latitude.outbox_events_unpublished_idx'::regclass",
        )
      ).rows[0]?.indisready,
    ).toBe(false)
    await writer.query("ROLLBACK")
    await deploy()
    expect((await indexes()).rows.every((index) => index.healthy)).toBe(true)
    expect((await history()).rows).toHaveLength(1)
  })

  it("resumes repair after a concurrent drop is interrupted with the index marked dead", async () => {
    await setupTable()
    await copyOutbox()
    await deploy()
    const firstReader = await connect()
    await firstReader.query("BEGIN; SELECT * FROM latitude.outbox_events LIMIT 1")
    const dropper = await connect()
    const { rows } = await dropper.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    const drop = dropper.query("DROP INDEX CONCURRENTLY latitude.outbox_events_unpublished_idx").then(
      () => null,
      (error: unknown) => error,
    )
    await waitFor(
      async () =>
        (
          await client.query(
            "SELECT NOT indisvalid AS invalid FROM pg_index WHERE indexrelid = to_regclass('latitude.outbox_events_unpublished_idx')",
          )
        ).rows[0]?.invalid === true,
    )
    const secondReader = await connect()
    await secondReader.query("BEGIN; SELECT * FROM latitude.outbox_events LIMIT 1")
    await firstReader.query("ROLLBACK")
    await waitFor(
      async () =>
        (
          await client.query(
            "SELECT NOT indislive AS dead FROM pg_index WHERE indexrelid = to_regclass('latitude.outbox_events_unpublished_idx')",
          )
        ).rows[0]?.dead === true,
    )
    await client.query("SELECT pg_cancel_backend($1)", [rows[0]?.pid])
    expect(await drop).toMatchObject({ code: "57014" })
    await secondReader.query("ROLLBACK")
    await deploy()
    expect((await indexes()).rows.every((index) => index.healthy)).toBe(true)
  })

  it("recreates missing indexes even when the old migration is already recorded", async () => {
    await setupTable()
    await copyOutbox()
    await deploy()
    const before = (await history()).rows
    await client.query("DROP INDEX latitude.outbox_events_unpublished_idx, latitude.outbox_events_published_at_idx")
    await deploy()
    expect((await indexes()).rows.every((index) => index.healthy)).toBe(true)
    expect((await history()).rows).toEqual(before)
  })

  it("restores URL-provided timeouts before running unrelated transactional migrations", async () => {
    const url = new URL(connectionString)
    url.searchParams.set("options", "-c lock_timeout=750ms -c statement_timeout=2min")
    await setupTable()
    await copyOutbox()
    await fixture(
      "20261002000000_settings",
      "CREATE TABLE public.migration_settings AS SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout;",
    )
    await migratePostgres({ connectionString: url.toString(), migrationConfig: { migrationsFolder: folder } })
    expect((await client.query("SELECT * FROM public.migration_settings")).rows).toEqual([
      { lock_timeout: "750ms", statement_timeout: "2min" },
    ])
  })

  it("rejects a same-name non-index object", async () => {
    await setupTable()
    await client.query("CREATE TABLE latitude.outbox_events_published_at_idx (id text)")
    await expect(deploy()).rejects.toThrow("unexpected definition")
    expect((await indexes()).rows).toEqual([])
  })

  it("refuses to repair an index while another concurrent build is active", async () => {
    await setupTable()
    const reader = await connect()
    await reader.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT * FROM latitude.outbox_events LIMIT 1")
    const builder = await connect()
    const build = builder.query(
      "CREATE INDEX CONCURRENTLY outbox_events_unpublished_idx ON latitude.outbox_events (created_at) WHERE published = false",
    )
    await waitFor(
      async () =>
        (await client.query("SELECT 1 FROM pg_stat_progress_create_index WHERE phase = 'waiting for old snapshots'"))
          .rowCount === 1,
    )
    await expect(deploy()).rejects.toThrow("still being built")
    await reader.query("ROLLBACK")
    await build
    await deploy()
    expect((await indexes()).rows.every((index) => index.healthy)).toBe(true)
  })

  it("serializes the entire deployment and releases its advisory lock after failure", async () => {
    await client.query("SELECT pg_advisory_lock(hashtext('latitude:pg:migrate'))")
    await expect(deploy()).rejects.toThrow("Another pg:migrate")
    await client.query("SELECT pg_advisory_unlock_all()")
    await fixture("20261002000000_failure", "SELECT 1/0;")
    await expect(deploy()).rejects.toThrow()
    await rm(join(folder, "20261002000000_failure"), { recursive: true })
    await deploy()
  })

  it("retains built indexes but rolls back all pending unrelated SQL and history on failure, then safely retries", async () => {
    await setupTable()
    await fixture("20260930000000_before", "CREATE TABLE public.unrelated (id int);")
    await copyOutbox()
    await fixture(
      "20261002000000_after",
      "CREATE TABLE public.after_outbox (id int);--> statement-breakpoint\nSELECT 1/0;",
    )
    await expect(deploy()).rejects.toThrow()
    expect((await indexes()).rows).toHaveLength(2)
    expect((await history()).rows).toEqual([])
    expect(
      (
        await client.query(
          "SELECT to_regclass('public.unrelated') AS unrelated, to_regclass('public.after_outbox') AS after_outbox",
        )
      ).rows[0],
    ).toEqual({ unrelated: null, after_outbox: null })
    const before = (await indexes()).rows
    await writeFile(join(folder, "20261002000000_after", "migration.sql"), "CREATE TABLE public.after_outbox (id int);")
    await deploy()
    expect((await indexes()).rows).toEqual(before)
    expect((await history()).rows).toHaveLength(3)
  })

  it("proves the v1 0119 COMMIT pattern runs concurrent DDL but breaks rollback of preceding history", async () => {
    await client.query(
      "CREATE SCHEMA latitude; CREATE EXTENSION pg_trgm; CREATE TABLE latitude.document_logs (custom_identifier text)",
    )
    await fixture("20260101000000_before", "CREATE TABLE public.before_commit (id int);")
    await fixture(
      "20260102000000_v1-0119",
      'COMMIT;\n--> statement-breakpoint\nCREATE INDEX CONCURRENTLY IF NOT EXISTS "document_logs_custom_identifier_trgm_idx" ON "latitude"."document_logs" USING gin ("custom_identifier" gin_trgm_ops);',
    )
    await fixture("20260103000000_failure", "SELECT 1/0;")
    await expect(migrate(drizzle({ client }), { migrationsFolder: folder })).rejects.toThrow()
    expect(
      (
        await client.query(
          "SELECT to_regclass('public.before_commit') AS before_commit, to_regclass('latitude.document_logs_custom_identifier_trgm_idx') AS concurrent_index",
        )
      ).rows[0],
    ).toEqual({ before_commit: "before_commit", concurrent_index: "document_logs_custom_identifier_trgm_idx" })
    expect((await history()).rows).toHaveLength(2)
  })

  it("proves interrupted v1 0276 COMMIT leaves an untracked ALTER that cannot replay", async () => {
    await client.query("CREATE SCHEMA latitude; CREATE TABLE latitude.spans (workspace_id int)")
    await fixture(
      "20260101000000_v1-0276",
      'ALTER TABLE "latitude"."spans" ADD COLUMN "custom_identifier" text;--> statement-breakpoint\nCOMMIT;--> statement-breakpoint\nCREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_workspace_custom_identifier_idx" ON "latitude"."spans" USING btree ("workspace_id","custom_identifier");',
    )
    const reader = await connect()
    await reader.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT * FROM pg_class LIMIT 1")
    const builder = await connect()
    const { rows } = await builder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    const migration = migrate(drizzle({ client: builder }), { migrationsFolder: folder }).then(
      () => null,
      (error: unknown) => error,
    )
    await waitFor(
      async () =>
        (
          await client.query(
            "SELECT 1 FROM pg_stat_progress_create_index WHERE pid = $1 AND phase = 'waiting for old snapshots'",
            [rows[0]?.pid],
          )
        ).rowCount === 1,
    )
    await client.query("SELECT pg_cancel_backend($1)", [rows[0]?.pid])
    expect(await migration).not.toBeNull()
    await reader.query("ROLLBACK")
    expect((await history()).rows).toEqual([])
    await expect(migrate(drizzle({ client }), { migrationsFolder: folder })).rejects.toThrow(/custom_identifier/)
  })
})
