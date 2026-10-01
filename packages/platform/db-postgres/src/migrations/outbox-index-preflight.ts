import type { Client } from "pg"

const INDEXES = [
  { name: "outbox_events_unpublished_idx", column: "created_at", predicate: "(published = false)" },
  { name: "outbox_events_published_at_idx", column: "published_at", predicate: "(published = true)" },
] as const

type OutboxIndex = (typeof INDEXES)[number]

const readIndex = async ({ client, index }: { client: Client; index: OutboxIndex }) => {
  const result = await client.query<{ matches: boolean; healthy: boolean }>(
    `SELECT COALESCE(
       c.relkind = 'i'
       AND i.indrelid = to_regclass('latitude.outbox_events')
       AND am.amname = 'btree'
       AND NOT i.indisunique AND NOT i.indisprimary AND NOT i.indisexclusion AND NOT i.indisreplident
       AND i.indnkeyatts = 1 AND i.indnatts = 1 AND i.indexprs IS NULL
       AND a.attname = $2 AND NOT a.attisdropped
       AND a.atttypid = 'pg_catalog.timestamptz'::regtype
       AND i.indoption[0] = 0 AND i.indcollation[0] = 0
       AND op.opcmethod = am.oid AND op.opcdefault AND op.opcintype = a.atttypid
       AND opn.nspname = 'pg_catalog' AND op.opcname = 'timestamptz_ops'
       AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) = $3, false) AS matches,
       COALESCE(i.indisvalid AND i.indisready AND i.indislive, false) AS healthy
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
     LEFT JOIN pg_catalog.pg_am am ON am.oid = c.relam
     LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
     LEFT JOIN pg_catalog.pg_opclass op ON op.oid = i.indclass[0]
     LEFT JOIN pg_catalog.pg_namespace opn ON opn.oid = op.opcnamespace
     WHERE n.nspname = 'latitude' AND c.relname = $1`,
    [index.name, index.column, index.predicate],
  )
  return result.rows[0]
}

const ensureIndex = async ({ client, index }: { client: Client; index: OutboxIndex }) => {
  const existing = await readIndex({ client, index })
  if (existing && !existing.matches) throw new Error(`Outbox index ${index.name} has an unexpected definition`)
  if (existing?.healthy) return
  if (existing) {
    const active = await client.query(
      "SELECT 1 FROM pg_catalog.pg_stat_progress_create_index WHERE index_relid = to_regclass($1)",
      [`latitude.${index.name}`],
    )
    if (active.rowCount) throw new Error(`Outbox index ${index.name} is still being built; retry after it finishes`)
    await client.query(`DROP INDEX CONCURRENTLY "latitude"."${index.name}"`)
  }
  await client.query(
    `CREATE INDEX CONCURRENTLY "${index.name}" ON "latitude"."outbox_events" USING btree ("${index.column}") WHERE ${index.predicate}`,
  )
  const created = await readIndex({ client, index })
  if (!created?.matches || !created.healthy) throw new Error(`Outbox index ${index.name} failed validation`)
}

export const prepareOutboxIndexes = async (client: Client) => {
  const table = await client.query<{ kind: string }>(
    "SELECT relkind AS kind FROM pg_catalog.pg_class WHERE oid = to_regclass('latitude.outbox_events')",
  )
  if (!table.rows.length) return
  if (table.rows[0]?.kind !== "r") throw new Error("Expected latitude.outbox_events to be an ordinary table")

  for (const index of INDEXES) {
    const existing = await readIndex({ client, index })
    if (existing && !existing.matches) throw new Error(`Outbox index ${index.name} has an unexpected definition`)
  }
  for (const index of INDEXES) await ensureIndex({ client, index })
  for (const index of INDEXES) {
    const existing = await readIndex({ client, index })
    if (!existing?.matches || !existing.healthy) throw new Error(`Outbox index ${index.name} failed validation`)
  }
}
