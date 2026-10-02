import { getTableConfig, PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import { outboxEvents } from "./outbox-events.ts"

const dialect = new PgDialect()

describe("outbox event indexes", () => {
  it.each([
    { name: "outbox_events_unpublished_idx", column: "created_at", published: false },
    { name: "outbox_events_published_at_idx", column: "published_at", published: true },
  ])("defines $name as a partial timestamp index", ({ name, column, published }) => {
    const table = getTableConfig(outboxEvents)
    const index = table.indexes.find((index) => index.config.name === name)

    expect(table.schema).toBe("latitude")
    expect(index).toBeDefined()
    expect(index?.config.method).toBe("btree")
    expect(index?.config.columns).toMatchObject([{ name: column, indexConfig: { order: "asc" } }])
    expect(index?.config.columns).toHaveLength(1)
    expect(index?.config.where).toBeDefined()

    if (!index?.config.where) throw new Error(`Missing predicate for ${name}`)

    expect(dialect.sqlToQuery(index.config.where)).toMatchObject({
      sql: `"latitude"."outbox_events"."published" = ${published}`,
      params: [],
    })
  })
})
