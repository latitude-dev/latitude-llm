import type { DomainEvent } from "@domain/events"
import { Effect } from "effect"
import type { Pool, PoolClient } from "pg"
import { describe, expect, it, vi } from "vitest"
import { createPollingOutboxConsumer, type OutboxEventRow } from "./outbox-consumer.ts"

const makeOutboxRow = (id: string): OutboxEventRow => ({
  id,
  event_name: "MagicLinkEmailRequested",
  aggregate_id: "user-1",
  workspace_id: "org-1",
  payload: { email: "user@example.com" },
  published: false,
  published_at: null,
  occurred_at: new Date(),
  created_at: new Date(),
})

interface FakeClientOptions {
  rowBatches: OutboxEventRow[][]
  failQueriesMatching?: { pattern: string; times: number }
}

const makeFakeClient = (options: FakeClientOptions) => {
  let remainingQueryFailures = options.failQueriesMatching?.times ?? 0
  const queries: string[] = []
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql)
      if (
        options.failQueriesMatching &&
        sql.includes(options.failQueriesMatching.pattern) &&
        remainingQueryFailures > 0
      ) {
        remainingQueryFailures -= 1
        throw new Error("terminating connection due to administrator command")
      }
      if (sql.includes("FROM latitude.outbox_events")) {
        return { rows: options.rowBatches.shift() ?? [] }
      }
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  return { client, queries }
}

interface FakePoolOptions {
  connectFailures?: number
  clientOptions: FakeClientOptions
}

const makeFakePool = (options: FakePoolOptions) => {
  let remainingConnectFailures = options.connectFailures ?? 0
  const { client, queries } = makeFakeClient(options.clientOptions)
  const pool = {
    connect: vi.fn(async () => {
      if (remainingConnectFailures > 0) {
        remainingConnectFailures -= 1
        throw new Error("connection refused")
      }
      return client as unknown as PoolClient
    }),
  } as unknown as Pool
  return { pool, client, queries }
}

const makeRecordingPublisher = () => {
  const published: DomainEvent[] = []
  return {
    published,
    publisher: {
      publish: (event: DomainEvent) =>
        Effect.sync(() => {
          published.push(event)
        }),
    },
  }
}

const startConsumer = async (pool: Pool, publisher: { publish: (event: DomainEvent) => Effect.Effect<void> }) => {
  const consumer = await Effect.runPromise(
    createPollingOutboxConsumer({ pool, pollIntervalMs: 5, batchSize: 10 }, publisher),
  )
  await Effect.runPromise(consumer.start())
  return consumer
}

describe("createPollingOutboxConsumer", () => {
  it("keeps polling after pool.connect failures and drains the backlog once the database recovers", async () => {
    const { pool } = makeFakePool({
      connectFailures: 2,
      clientOptions: { rowBatches: [[makeOutboxRow("evt-1")]] },
    })
    const { published, publisher } = makeRecordingPublisher()

    const consumer = await startConsumer(pool, publisher)
    try {
      await vi.waitFor(() => expect(published).toHaveLength(1))
    } finally {
      await Effect.runPromise(consumer.stop())
    }

    expect((pool.connect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(published[0]?.name).toBe("MagicLinkEmailRequested")
  })

  it("keeps polling after an in-transaction failure and releases the failed client", async () => {
    const { pool, client } = makeFakePool({
      clientOptions: {
        rowBatches: [[makeOutboxRow("evt-1")]],
        failQueriesMatching: { pattern: "BEGIN", times: 1 },
      },
    })
    const { published, publisher } = makeRecordingPublisher()

    const consumer = await startConsumer(pool, publisher)
    try {
      await vi.waitFor(() => expect(published).toHaveLength(1))
    } finally {
      await Effect.runPromise(consumer.stop())
    }

    expect(client.release.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it("marks published events and stops polling cleanly on stop()", async () => {
    const { pool, queries } = makeFakePool({
      clientOptions: { rowBatches: [[makeOutboxRow("evt-1"), makeOutboxRow("evt-2")]] },
    })
    const { published, publisher } = makeRecordingPublisher()

    const consumer = await startConsumer(pool, publisher)
    try {
      await vi.waitFor(() => expect(published).toHaveLength(2))
    } finally {
      await Effect.runPromise(consumer.stop())
    }

    expect(queries.some((sql) => sql.includes("UPDATE latitude.outbox_events"))).toBe(true)

    const connectCallsAfterStop = (pool.connect as ReturnType<typeof vi.fn>).mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect((pool.connect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(connectCallsAfterStop)
  })
})
