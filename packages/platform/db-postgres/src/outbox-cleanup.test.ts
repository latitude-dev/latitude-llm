import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanupPublishedOutboxEvents, OutboxCleanupError } from "./outbox-cleanup.ts"
import { setupTestPostgres } from "./test/in-memory-postgres.ts"

const pg = setupTestPostgres()
const NOW = new Date("2026-10-01T12:00:00.000Z")
const CUTOFF = "2026-09-24T12:00:00.000Z"

const insertEvent = async ({
  id,
  published = true,
  publishedAt = "2026-09-23T12:00:00.000Z",
  createdAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string
  published?: boolean
  publishedAt?: string | null
  createdAt?: string
}) => {
  await pg.client.query(
    `INSERT INTO latitude.outbox_events
      (id, event_name, aggregate_id, workspace_id, payload, published, published_at, occurred_at, created_at)
      VALUES ($1, 'MagicLinkEmailRequested', 'user', 'org', '{}', $2, $3, $4, $4)`,
    [id, published, publishedAt, createdAt],
  )
}

const remainingIds = async () => {
  const result = await pg.client.query<{ id: string }>("SELECT id FROM latitude.outbox_events ORDER BY id")
  return result.rows.map((row) => row.id)
}

beforeEach(async () => {
  await pg.client.exec("TRUNCATE latitude.outbox_events")
})

describe("cleanupPublishedOutboxEvents", () => {
  it("retains unpublished, null, recent, future and exact-cutoff rows regardless of creation time", async () => {
    await insertEvent({ id: "expired", createdAt: NOW.toISOString() })
    await insertEvent({ id: "unpublished", published: false })
    await insertEvent({ id: "unpublished-null", published: false, publishedAt: null })
    await insertEvent({ id: "published-null", publishedAt: null })
    await insertEvent({ id: "boundary", publishedAt: CUTOFF })
    await insertEvent({ id: "recent", publishedAt: "2026-09-30T00:00:00.000Z" })
    await insertEvent({ id: "future", publishedAt: "2026-10-02T00:00:00.000Z" })

    const result = await cleanupPublishedOutboxEvents(pg.adminPostgresClient, { now: NOW })

    expect(result).toMatchObject({ cutoff: CUTOFF, deletedCount: 1, batchCount: 1, limitReached: false })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(await remainingIds()).toEqual([
      "boundary",
      "future",
      "published-null",
      "recent",
      "unpublished",
      "unpublished-null",
    ])
  })

  it("bounds each run and deletes oldest publications first, resuming safely on later runs", async () => {
    for (let index = 0; index < 5; index++) {
      await insertEvent({ id: `event-${index}`, publishedAt: `2026-09-${10 + index}T00:00:00.000Z` })
    }
    const options = { now: NOW, batchSize: 2, maxBatches: 2 }
    expect(await cleanupPublishedOutboxEvents(pg.adminPostgresClient, options)).toMatchObject({
      deletedCount: 4,
      batchCount: 2,
      limitReached: true,
    })
    expect(await remainingIds()).toEqual(["event-4"])
    expect(await cleanupPublishedOutboxEvents(pg.adminPostgresClient, options)).toMatchObject({
      deletedCount: 1,
      batchCount: 1,
      limitReached: false,
    })
    expect(await cleanupPublishedOutboxEvents(pg.adminPostgresClient, options)).toMatchObject({
      deletedCount: 0,
      batchCount: 1,
      limitReached: false,
    })
  })

  it("caps the default run at 100 batches of 1000 rows", async () => {
    await pg.client.exec(`
      INSERT INTO latitude.outbox_events
        (id, event_name, aggregate_id, workspace_id, payload, published, published_at, occurred_at)
      SELECT 'event-' || n, 'MagicLinkEmailRequested', 'user', 'org', '{}', true,
        '2026-09-01T00:00:00Z'::timestamptz, NOW()
      FROM generate_series(1, 100001) AS n;
    `)
    expect(await cleanupPublishedOutboxEvents(pg.adminPostgresClient, { now: NOW })).toMatchObject({
      deletedCount: 100000,
      batchCount: 100,
      limitReached: true,
    })
    expect(await remainingIds()).toHaveLength(1)
  }, 30_000)

  it("fixes the cutoff before the first batch even if the supplied clock advances", async () => {
    const now = new Date(NOW)
    await insertEvent({ id: "expired" })
    await insertEvent({ id: "boundary", publishedAt: CUTOFF })
    const execute = pg.adminPostgresClient.db.execute.bind(pg.adminPostgresClient.db)
    const spy = vi.spyOn(pg.adminPostgresClient.db, "execute").mockImplementation((query) => {
      now.setUTCDate(now.getUTCDate() + 1)
      return execute(query)
    })
    try {
      expect(await cleanupPublishedOutboxEvents(pg.adminPostgresClient, { now, batchSize: 1 })).toMatchObject({
        cutoff: CUTOFF,
        deletedCount: 1,
        batchCount: 2,
      })
      expect(await remainingIds()).toEqual(["boundary"])
    } finally {
      spy.mockRestore()
    }
  })

  it("keeps earlier batches committed when a later batch fails and reports progress", async () => {
    await insertEvent({ id: "first", publishedAt: "2026-09-20T00:00:00.000Z" })
    await insertEvent({ id: "fail" })
    await pg.client.exec(`
      CREATE FUNCTION latitude.fail_outbox_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.id = 'fail' THEN RAISE EXCEPTION 'cleanup test failure'; END IF;
        RETURN OLD;
      END $$;
      CREATE TRIGGER fail_outbox_cleanup BEFORE DELETE ON latitude.outbox_events
      FOR EACH ROW EXECUTE FUNCTION latitude.fail_outbox_cleanup();
    `)
    try {
      let failure: unknown
      try {
        await cleanupPublishedOutboxEvents(pg.adminPostgresClient, { now: NOW, batchSize: 1 })
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(OutboxCleanupError)
      expect(failure).toMatchObject({ progress: { deletedCount: 1, batchCount: 1, cutoff: CUTOFF } })
      expect(await remainingIds()).toEqual(["fail"])
    } finally {
      await pg.client.exec(`
        DROP TRIGGER fail_outbox_cleanup ON latitude.outbox_events;
        DROP FUNCTION latitude.fail_outbox_cleanup();
      `)
    }
    expect(await cleanupPublishedOutboxEvents(pg.adminPostgresClient, { now: NOW })).toMatchObject({ deletedCount: 1 })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid limits (%s)", async (limit) => {
    await expect(cleanupPublishedOutboxEvents(pg.adminPostgresClient, { batchSize: limit })).rejects.toThrow(RangeError)
    await expect(cleanupPublishedOutboxEvents(pg.adminPostgresClient, { maxBatches: limit })).rejects.toThrow(
      RangeError,
    )
  })
})
