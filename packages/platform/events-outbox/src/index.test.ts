import type { EventsPublisher } from "@domain/events"
import { outboxEvents } from "@platform/db-postgres"
import { setupTestPostgres } from "@platform/testkit"
import { asc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import type { Pool } from "pg"
import { beforeEach, describe, expect, it } from "vitest"
import { createPollingOutboxConsumer, type OutboxEventRow } from "./index.ts"

type QueryResult<Row> = { rows: Row[] }

class PostgresOutboxPoolAdapter {
  constructor(
    private readonly db: ReturnType<typeof setupTestPostgres>["postgresDb"],
    private readonly now: () => Date,
  ) {}

  connect = async () => ({
    query: async <Row>(queryText: string, params?: readonly unknown[]): Promise<QueryResult<Row>> => {
      const normalized = queryText.trim().replaceAll(/\s+/g, " ")

      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
        return { rows: [] }
      }

      if (normalized.includes("FROM latitude.outbox_events")) {
        const limit = Number(params?.[0] ?? 100)
        const rows = await this.db
          .select()
          .from(outboxEvents)
          .where(eq(outboxEvents.published, false))
          .orderBy(asc(outboxEvents.createdAt))
          .limit(limit)

        const mapped: OutboxEventRow[] = rows.map((row) => ({
          id: row.id,
          event_name: row.eventName,
          aggregate_id: row.aggregateId,
          workspace_id: row.organizationId,
          payload: row.payload,
          published: row.published,
          published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
          occurred_at: row.occurredAt,
          created_at: row.createdAt,
        }))

        return { rows: mapped as Row[] }
      }

      if (normalized.includes("UPDATE latitude.outbox_events")) {
        const ids = (params?.[0] ?? []) as string[]
        if (ids.length > 0) {
          await this.db
            .update(outboxEvents)
            .set({ published: true, publishedAt: this.now() })
            .where(inArray(outboxEvents.id, ids))
        }
        return { rows: [] }
      }

      throw new Error(`Unhandled query in PostgresOutboxPoolAdapter: ${normalized}`)
    },
    release: () => undefined,
  })
}

const pg = setupTestPostgres()

const waitFor = async (predicate: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`)
}

describe("createPollingOutboxConsumer", () => {
  beforeEach(async () => {
    await pg.db.delete(outboxEvents)
  })

  it("publishes pending outbox events and marks them as published", async () => {
    const now = new Date("2026-03-18T10:00:00.000Z")
    const pool = new PostgresOutboxPoolAdapter(pg.postgresDb, () => now)
    const publishedEventIds: string[] = []
    const publisher: EventsPublisher = {
      publish: async (envelope) => {
        publishedEventIds.push(envelope.id)
      },
    }

    await pg.db.insert(outboxEvents).values([
      {
        id: "outbox_event_test_000001",
        eventName: "dataset.created",
        aggregateId: "aggregate_test_000001",
        organizationId: "org_outbox_test_000001",
        payload: { datasetId: "dataset_1" },
        occurredAt: new Date("2026-03-18T09:59:00.000Z"),
      },
      {
        id: "outbox_event_test_000002",
        eventName: "dataset.created",
        aggregateId: "aggregate_test_000002",
        organizationId: "org_outbox_test_000001",
        payload: { datasetId: "dataset_2" },
        occurredAt: new Date("2026-03-18T09:59:30.000Z"),
      },
    ])

    const consumer = await Effect.runPromise(
      createPollingOutboxConsumer(
        {
          pool: pool as unknown as Pool,
          pollIntervalMs: 10,
          batchSize: 100,
        },
        publisher,
      ),
    )

    await Effect.runPromise(consumer.start())

    await waitFor(async () => {
      const rows = await pg.db.select().from(outboxEvents).where(eq(outboxEvents.published, true))
      return rows.length === 2
    })

    await Effect.runPromise(consumer.stop())

    const rows = await pg.db.select().from(outboxEvents).orderBy(asc(outboxEvents.createdAt))

    expect(publishedEventIds).toEqual(["outbox_event_test_000001", "outbox_event_test_000002"])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.published).toBe(true)
    expect(rows[1]?.published).toBe(true)
    expect(rows[0]?.publishedAt?.toISOString()).toBe("2026-03-18T10:00:00.000Z")
    expect(rows[1]?.publishedAt?.toISOString()).toBe("2026-03-18T10:00:00.000Z")
  })

  it("keeps failed events unpublished while marking successful ones", async () => {
    const now = new Date("2026-03-18T11:00:00.000Z")
    const pool = new PostgresOutboxPoolAdapter(pg.postgresDb, () => now)
    const failedEventId = "outbox_event_test_000011"
    const publisher: EventsPublisher = {
      publish: async (envelope) => {
        if (envelope.id === failedEventId) {
          throw new Error("publish failed")
        }
      },
    }

    await pg.db.insert(outboxEvents).values([
      {
        id: failedEventId,
        eventName: "dataset.deleted",
        aggregateId: "aggregate_test_000011",
        organizationId: "org_outbox_test_000001",
        payload: { datasetId: "dataset_fail" },
        occurredAt: new Date("2026-03-18T10:59:00.000Z"),
      },
      {
        id: "outbox_event_test_000012",
        eventName: "dataset.deleted",
        aggregateId: "aggregate_test_000012",
        organizationId: "org_outbox_test_000001",
        payload: { datasetId: "dataset_ok" },
        occurredAt: new Date("2026-03-18T10:59:30.000Z"),
      },
    ])

    const consumer = await Effect.runPromise(
      createPollingOutboxConsumer(
        {
          pool: pool as unknown as Pool,
          pollIntervalMs: 10,
          batchSize: 100,
        },
        publisher,
      ),
    )

    await Effect.runPromise(consumer.start())

    await waitFor(async () => {
      const [okRow] = await pg.db.select().from(outboxEvents).where(eq(outboxEvents.id, "outbox_event_test_000012"))
      return okRow?.published === true
    })

    await Effect.runPromise(consumer.stop())

    const rows = await pg.db
      .select()
      .from(outboxEvents)
      .where(inArray(outboxEvents.id, [failedEventId, "outbox_event_test_000012"]))
      .orderBy(asc(outboxEvents.id))

    const failedRow = rows.find((row) => row.id === failedEventId)
    const okRow = rows.find((row) => row.id === "outbox_event_test_000012")

    expect(okRow?.published).toBe(true)
    expect(okRow?.publishedAt?.toISOString()).toBe("2026-03-18T11:00:00.000Z")
    expect(failedRow?.published).toBe(false)
    expect(failedRow?.publishedAt).toBeNull()
  })
})
