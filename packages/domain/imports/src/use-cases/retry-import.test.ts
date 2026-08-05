import { FREE_PLAN_CONFIG } from "@domain/billing"
import { generateId, ImportJobId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { IMPORT_WINDOW_BASE_MS } from "../constants.ts"
import type { ImportJob } from "../entities/import-job.ts"
import {
  importHarness,
  STUB_IMPORT_CREDENTIALS,
  STUB_IMPORT_MAX_TRACES,
  STUB_IMPORT_ORGANIZATION_ID,
  STUB_IMPORT_PROJECT_ID,
  stubEnterprisePlan,
  stubFreePlan,
  stubImportJob,
} from "../testing/harness.ts"
import { retryImportUseCase } from "./retry-import.ts"

/** Mid-range: a window part-way down the walk, with the adapter part-way through it. */
const PARTWAY_CURSOR = {
  windowEnd: new Date("2026-03-15T00:00:00Z"),
  windowMs: IMPORT_WINDOW_BASE_MS,
  source: { page: 7 },
}

const CARRIED_STATS = {
  recordsFetched: 70,
  sessionsImported: 9,
  tracesImported: 14,
  spansImported: 68,
  spansSkipped: 2,
}

/** How a failed job is left: credentials scrubbed, cursor and counts kept for the resume. */
const failedJob = (overrides: Partial<ImportJob> = {}) =>
  stubImportJob({
    status: "failed",
    credentials: null,
    cursor: PARTWAY_CURSOR,
    error: "[500] server_error: upstream",
    stats: CARRIED_STATS,
    startedAt: new Date("2026-03-14T00:00:00Z"),
    finishedAt: new Date("2026-03-14T01:00:00Z"),
    ...overrides,
  })

const retry = (importJobId: ImportJob["id"], plan = stubEnterprisePlan()) =>
  retryImportUseCase({ importJobId, credentials: STUB_IMPORT_CREDENTIALS, plan })

const causeOf = (exit: Exit.Exit<unknown, unknown>) => JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)

describe("retryImportUseCase", () => {
  it("resumes from the failed job's cursor and carries its counts forward", async () => {
    const failed = failedJob()
    const h = importHarness({ seed: [failed] })

    const retried = await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

    expect(retried.id).not.toBe(failed.id)
    expect(retried.status).toBe("created")
    expect(retried.cursor).toEqual(PARTWAY_CURSOR)
    expect(retried.stats).toEqual(CARRIED_STATS)
    expect(retried.config).toEqual(failed.config)
  })

  it("starts the retry clean of the original's outcome", async () => {
    const failed = failedJob()
    const h = importHarness({ seed: [failed] })

    const retried = await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

    expect(retried.error).toBeNull()
    expect(retried.startedAt).toBeNull()
    expect(retried.finishedAt).toBeNull()
    expect(retried.cancelledAt).toBeNull()
    expect(retried.runs).toEqual([])
  })

  it("takes fresh credentials because the failed job's were scrubbed", async () => {
    const failed = failedJob()
    const h = importHarness({ seed: [failed] })

    const retried = await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

    expect(failed.credentials).toBeNull()
    expect(retried.credentials).toEqual(STUB_IMPORT_CREDENTIALS)
  })

  it("keeps the failed job as an audit record", async () => {
    const failed = failedJob()
    const h = importHarness({ seed: [failed] })

    await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(failed.id)?.status).toBe("failed")
    expect(h.stored.get(failed.id)?.stats).toEqual(CARRIED_STATS)
    expect(h.stored.size).toBe(2)
  })

  it("persists the retry job it returns", async () => {
    const failed = failedJob()
    const h = importHarness({ seed: [failed] })

    const retried = await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(retried.id)).toEqual(retried)
  })

  it("retries a cancelled job too", async () => {
    const cancelled = stubImportJob({ status: "cancelled", credentials: null, cursor: PARTWAY_CURSOR })
    const h = importHarness({ seed: [cancelled] })

    const retried = await Effect.runPromise(retry(cancelled.id).pipe(Effect.provide(h.layer)))

    expect(retried.cursor).toEqual(PARTWAY_CURSOR)
  })

  // A capped job is the best candidate for resumption there is: it stopped because a ceiling
  // was reached, not because anything went wrong, and its cursor is exactly where to carry on.
  it("resumes a capped job from where the plan stopped it", async () => {
    const capped = stubImportJob({
      status: "capped",
      credentials: null,
      cursor: PARTWAY_CURSOR,
      stats: CARRIED_STATS,
      error: "Ran out of plan usage for this billing period.",
    })
    const h = importHarness({ seed: [capped] })

    const retried = await Effect.runPromise(retry(capped.id).pipe(Effect.provide(h.layer)))

    expect(retried.cursor).toEqual(PARTWAY_CURSOR)
    expect(retried.stats).toEqual(CARRIED_STATS)
    expect(retried.status).toBe("created")
    // The cap reason belongs to the job that stopped, not to the one carrying on.
    expect(retried.error).toBeNull()
    expect(h.written[0]).toMatchObject({
      eventName: "ImportRetried",
      payload: { fromJobId: capped.id, fromStatus: "capped" },
    })
  })

  it("restarts from the top of the range when the original never advanced", async () => {
    const failed = failedJob({ cursor: null, stats: { ...CARRIED_STATS, tracesImported: 0 } })
    const h = importHarness({ seed: [failed] })

    const retried = await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

    expect(retried.cursor).toBeNull()
  })

  describe("refusals", () => {
    // `capped` is deliberately absent: it means the plan stopped the job, which the period reset
    // fixes, and its cursor points where it left off. `succeeded` now covers a job that met the
    // user's own `maxTraces`, which is why resuming it would be pointless.
    it.each([
      ["created" as const],
      ["queued" as const],
      ["running" as const],
      ["succeeded" as const],
    ])("refuses to retry a %s job", async (status) => {
      const job = stubImportJob({ status, error: null })
      const h = importHarness({ seed: [job] })

      const exit = await Effect.runPromiseExit(retry(job.id).pipe(Effect.provide(h.layer)))

      expect(causeOf(exit)).toContain("ImportJobNotRetryableError")
      expect(h.stored.size).toBe(1)
      expect(h.written).toEqual([])
    })

    it.each([
      ["created" as const],
      ["queued" as const],
      ["running" as const],
    ])("refuses to retry while a %s import holds the org's slot", async (status) => {
      const failed = failedJob()
      const active = stubImportJob({ status })
      const h = importHarness({ seed: [failed, active] })

      const exit = await Effect.runPromiseExit(retry(failed.id).pipe(Effect.provide(h.layer)))

      expect(causeOf(exit)).toContain("ActiveImportConflictError")
      expect(h.stored.size).toBe(2)
      expect(h.written).toEqual([])
    })

    // The engine re-checks plan usage before reading a page, so resuming while it is still spent
    // would enqueue a job that caps again having imported nothing.
    it("refuses to resume while the plan still has no usage left", async () => {
      const capped = stubImportJob({ status: "capped", credentials: null, cursor: PARTWAY_CURSOR })
      const h = importHarness({
        seed: [capped],
        plan: stubFreePlan(),
        consumedCredits: FREE_PLAN_CONFIG.includedCredits,
      })

      const exit = await Effect.runPromiseExit(retry(capped.id, h.plan).pipe(Effect.provide(h.layer)))

      expect(causeOf(exit)).toContain("ImportUsageExhaustedError")
      expect(h.stored.size).toBe(1)
      expect(h.written).toEqual([])
    })

    it("fails when the job does not exist", async () => {
      const h = importHarness()

      const exit = await Effect.runPromiseExit(retry(ImportJobId(generateId())).pipe(Effect.provide(h.layer)))

      expect(causeOf(exit)).toContain("ImportJobNotFoundError")
      expect(h.stored.size).toBe(0)
    })

    // A cursor only means anything against the deployment it was read from, and the engine
    // pages against the job's snapshotted origin regardless — so this is a new import.
    it("refuses credentials naming a different region than the job was created against", async () => {
      const failed = failedJob()
      const h = importHarness({ seed: [failed] })

      const exit = await Effect.runPromiseExit(
        retryImportUseCase({
          importJobId: failed.id,
          credentials: { kind: "langfuse", region: "us", publicKey: "pk-lf-1234567890", secretKey: "sk-lf-1234567890" },
          plan: stubEnterprisePlan(),
        }).pipe(Effect.provide(h.layer)),
      )

      expect(causeOf(exit)).toContain("ImportRegionMismatchError")
      expect(h.stored.size).toBe(1)
      expect(h.written).toEqual([])
    })
  })

  describe("ImportRetried", () => {
    it("is emitted against the new job, with the lineage of the one it resumed", async () => {
      const failed = failedJob()
      const h = importHarness({ seed: [failed] })

      const retried = await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

      expect(h.written).toHaveLength(1)
      expect(h.written[0]).toMatchObject({
        eventName: "ImportRetried",
        aggregateType: "import-job",
        // The retry job, so the `ImportFinished` that closes it lines up on `importJobId`.
        aggregateId: retried.id,
        organizationId: STUB_IMPORT_ORGANIZATION_ID,
        payload: {
          organizationId: STUB_IMPORT_ORGANIZATION_ID,
          projectId: STUB_IMPORT_PROJECT_ID,
          importJobId: retried.id,
          fromJobId: failed.id,
          fromStatus: "failed",
          fromError: "[500] server_error: upstream",
          fromTraces: 14,
        },
      })
    })

    it("reports a cancelled origin with no error, since nothing went wrong", async () => {
      const cancelled = stubImportJob({ status: "cancelled", credentials: null, cursor: PARTWAY_CURSOR })
      const h = importHarness({ seed: [cancelled] })

      await Effect.runPromise(retry(cancelled.id).pipe(Effect.provide(h.layer)))

      expect(h.written[0]).toMatchObject({
        payload: { fromStatus: "cancelled", fromError: null, fromTraces: 0 },
      })
    })

    // The config cannot change on a retry, so the original's `ImportStarted` still describes it.
    it("does not restate the configuration", async () => {
      const failed = failedJob()
      const h = importHarness({ seed: [failed] })

      await Effect.runPromise(retry(failed.id).pipe(Effect.provide(h.layer)))

      expect(h.written[0]?.payload).not.toHaveProperty("maxTraces")
      expect(h.written[0]?.payload).not.toHaveProperty("rangeDays")
      expect(failed.config.maxTraces).toBe(STUB_IMPORT_MAX_TRACES)
    })
  })
})
