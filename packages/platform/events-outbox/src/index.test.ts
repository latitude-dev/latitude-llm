import type { EventsPublisher } from "@domain/events"
import type { Pool, PoolClient } from "pg"
import { describe, expect, it, vi } from "vitest"
import { createPollingOutboxConsumer } from "./index.ts"

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe("createPollingOutboxConsumer", () => {
  it("marks only successfully published events using text[] ids", async () => {
    const queries: Array<{ readonly sql: string; readonly params: unknown[] | undefined }> = []

    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })

        if (sql.includes("SELECT")) {
          return {
            rows: [
              {
                id: "evt_1",
                event_name: "event.one",
                aggregate_id: "agg_1",
                workspace_id: "ws_1",
                payload: { a: 1 },
                published: false,
                published_at: null,
                occurred_at: new Date("2026-01-01T00:00:00.000Z"),
                created_at: new Date("2026-01-01T00:00:00.000Z"),
              },
              {
                id: "evt_2",
                event_name: "event.two",
                aggregate_id: "agg_2",
                workspace_id: "ws_1",
                payload: { b: 2 },
                published: false,
                published_at: null,
                occurred_at: new Date("2026-01-01T00:00:00.000Z"),
                created_at: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
          }
        }

        return { rows: [] }
      }),
      release: vi.fn(),
    } as unknown as PoolClient

    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool

    const publisher: EventsPublisher = {
      publish: vi.fn(async (envelope) => {
        if (envelope.id === "evt_2") {
          throw new Error("publish failed")
        }
      }),
    }

    const consumer = createPollingOutboxConsumer(
      {
        pool,
        pollIntervalMs: 60_000,
        batchSize: 100,
      },
      publisher,
    )

    consumer.start()
    await wait(50)
    await consumer.stop()

    const markCall = queries.find((entry) => entry.sql.includes("UPDATE outbox_events"))
    expect(markCall).toBeDefined()
    expect(markCall?.sql).toContain("::text[]")
    expect(markCall?.params).toEqual([["evt_1"]])
  })
})
