import { setupTestPostgres } from "@platform/db-postgres/testing"
import { Schedule } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TestQueueConsumer } from "../testing/test-queue-consumer.ts"
import { createOutboxCleanupWorker } from "./outbox-cleanup.ts"

const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }))
vi.mock("@repo/observability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/observability")>()),
  createLogger: () => logger,
}))

const pg = setupTestPostgres()

beforeEach(async () => {
  vi.clearAllMocks()
  await pg.client.exec("TRUNCATE latitude.outbox_events")
})

const createWorker = () => {
  const consumer = new TestQueueConsumer()
  createOutboxCleanupWorker({
    consumer,
    postgresClient: pg.adminPostgresClient,
    retrySchedule: Schedule.spaced("0 millis"),
  })
  return consumer
}

const insertEvents = () =>
  pg.client.exec(`
    INSERT INTO latitude.outbox_events
      (id, event_name, aggregate_id, workspace_id, payload, published, published_at, occurred_at)
    VALUES
      ('expired', 'MagicLinkEmailRequested', 'user', 'org', '{}', true, NOW() - interval '8 days', NOW()),
      ('recent', 'MagicLinkEmailRequested', 'user', 'org', '{}', true, NOW() - interval '6 days', NOW()),
      ('pending', 'MagicLinkEmailRequested', 'user', 'org', '{}', false, NOW() - interval '8 days', NOW()),
      ('null', 'MagicLinkEmailRequested', 'user', 'org', '{}', true, NULL, NOW());
  `)

const remainingIds = async () => {
  const result = await pg.client.query<{ id: string }>("SELECT id FROM latitude.outbox_events ORDER BY id")
  return result.rows.map((row) => row.id)
}

describe("outbox cleanup worker", () => {
  it("registers the maintenance task and cleans only expired published rows at execution time", async () => {
    const consumer = createWorker()
    expect(consumer.getRegisteredQueues()).toEqual(["outbox-cleanup"])
    expect(consumer.getRegisteredTasks("outbox-cleanup")).toEqual(["run"])
    await insertEvents()

    await consumer.dispatchTask("outbox-cleanup", "run", {})
    expect(await remainingIds()).toEqual(["null", "pending", "recent"])
    expect(logger.info).toHaveBeenLastCalledWith(
      "Outbox cleanup completed",
      expect.objectContaining({
        deletedCount: 1,
        batchCount: 1,
        durationMs: expect.any(Number),
        cutoff: expect.any(String),
        limitReached: false,
      }),
    )
    await consumer.dispatchTask("outbox-cleanup", "run", {})
    expect(await remainingIds()).toEqual(["null", "pending", "recent"])
    expect(logger.info).toHaveBeenLastCalledWith(
      "Outbox cleanup completed",
      expect.objectContaining({ deletedCount: 0 }),
    )
  })

  it("recovers from transient failures within one task with a fresh cutoff per attempt", async () => {
    const consumer = createWorker()
    await insertEvents()
    await pg.client.exec(`
      CREATE SEQUENCE latitude.worker_outbox_cleanup_attempt;
      CREATE FUNCTION latitude.fail_worker_outbox_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF nextval('latitude.worker_outbox_cleanup_attempt') <= 2 THEN
          RAISE EXCEPTION 'transient worker cleanup test failure';
        END IF;
        RETURN OLD;
      END $$;
      CREATE TRIGGER fail_worker_outbox_cleanup BEFORE DELETE ON latitude.outbox_events
      FOR EACH ROW EXECUTE FUNCTION latitude.fail_worker_outbox_cleanup();
    `)
    const now = new Date()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(now)
    logger.error
      .mockImplementationOnce(() => vi.setSystemTime(now.getTime() + 1000))
      .mockImplementationOnce(() => vi.setSystemTime(now.getTime() + 2000))
    try {
      await consumer.dispatchTask("outbox-cleanup", "run", {})
      expect(logger.error).toHaveBeenCalledTimes(2)
      const cutoff = (offset: number) => new Date(now.getTime() + offset - 7 * 24 * 60 * 60 * 1000).toISOString()
      for (const [index, offset] of [0, 1000].entries()) {
        expect(logger.error).toHaveBeenNthCalledWith(
          index + 1,
          "Outbox cleanup failed",
          expect.objectContaining({ cutoff: cutoff(offset), deletedCount: 0, batchCount: 0, error: expect.anything() }),
        )
      }
      expect(logger.info).toHaveBeenCalledTimes(1)
      expect(logger.info).toHaveBeenLastCalledWith(
        "Outbox cleanup completed",
        expect.objectContaining({ cutoff: cutoff(2000), deletedCount: 1, batchCount: 1, limitReached: false }),
      )
      expect(await remainingIds()).toEqual(["null", "pending", "recent"])
    } finally {
      vi.useRealTimers()
      await pg.client.exec(`
        DROP TRIGGER fail_worker_outbox_cleanup ON latitude.outbox_events;
        DROP FUNCTION latitude.fail_worker_outbox_cleanup();
        DROP SEQUENCE latitude.worker_outbox_cleanup_attempt;
      `)
    }
  })

  it("logs all three failed attempts and propagates the terminal failure", async () => {
    const consumer = createWorker()
    await insertEvents()
    await pg.client.exec(`
      CREATE FUNCTION latitude.fail_worker_outbox_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'worker cleanup test failure'; END $$;
      CREATE TRIGGER fail_worker_outbox_cleanup BEFORE DELETE ON latitude.outbox_events
      FOR EACH ROW EXECUTE FUNCTION latitude.fail_worker_outbox_cleanup();
    `)
    try {
      await expect(consumer.dispatchTask("outbox-cleanup", "run", {})).rejects.toThrow()
      expect(logger.error).toHaveBeenCalledTimes(3)
      expect(logger.info).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenLastCalledWith(
        "Outbox cleanup failed",
        expect.objectContaining({
          deletedCount: 0,
          batchCount: 0,
          durationMs: expect.any(Number),
          error: expect.anything(),
        }),
      )
      expect(await remainingIds()).toEqual(["expired", "null", "pending", "recent"])
    } finally {
      await pg.client.exec(`
        DROP TRIGGER fail_worker_outbox_cleanup ON latitude.outbox_events;
        DROP FUNCTION latitude.fail_worker_outbox_cleanup();
      `)
    }
    await consumer.dispatchTask("outbox-cleanup", "run", {})
    expect(await remainingIds()).toEqual(["null", "pending", "recent"])
  })
})
