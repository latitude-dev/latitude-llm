import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { IMPORT_WINDOW_BASE_MS } from "../constants.ts"
import type { ImportJob } from "../entities/import-job.ts"
import {
  importHarness,
  STUB_IMPORT_ORGANIZATION_ID,
  STUB_IMPORT_PROJECT_ID,
  stubImportJob,
} from "../testing/harness.ts"
import { finishImport } from "./finish-import.ts"

const TERMINAL_STATUSES = [["succeeded"], ["capped"], ["cancelled"], ["failed"]] as const

const STARTED_AT = new Date("2026-04-01T00:00:00Z")

const runningJob = (overrides: Partial<ImportJob> = {}) =>
  stubImportJob({ status: "running", startedAt: STARTED_AT, ...overrides })

const FINAL_STATS = { recordsFetched: 90, tracesImported: 30, spansImported: 88, spansSkipped: 2 }

describe("finishImport", () => {
  it.each(TERMINAL_STATUSES)("moves a running job to %s and stamps finishedAt", async (status) => {
    const job = runningJob()
    const h = importHarness({ seed: [job] })

    await Effect.runPromise(finishImport(job, status).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(job.id)?.status).toBe(status)
    expect(h.stored.get(job.id)?.finishedAt).toBeInstanceOf(Date)
  })

  // No terminal state has any further use for them, and they are the one secret on the row.
  it.each(TERMINAL_STATUSES)("scrubs the credentials on a %s finish", async (status) => {
    const job = runningJob()
    const h = importHarness({ seed: [job] })

    await Effect.runPromise(finishImport(job, status).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(job.id)?.credentials).toBeNull()
  })

  it("returns the persisted row", async () => {
    const job = runningJob()
    const h = importHarness({ seed: [job] })

    const finished = await Effect.runPromise(
      finishImport(job, "succeeded", { stats: FINAL_STATS }).pipe(Effect.provide(h.layer)),
    )

    expect(finished).toEqual(h.stored.get(job.id))
    expect(finished.stats).toEqual(FINAL_STATS)
  })

  it("applies the whole patch to the row", async () => {
    const job = runningJob()
    const h = importHarness({ seed: [job] })
    const cursor = { windowEnd: new Date("2026-03-01T00:00:00Z"), windowMs: IMPORT_WINDOW_BASE_MS, source: null }
    const runs = [
      {
        status: "succeeded" as const,
        cursor: { start: cursor, end: cursor },
        stats: FINAL_STATS,
        error: null,
        startedAt: STARTED_AT,
        finishedAt: new Date("2026-04-01T00:01:00Z"),
      },
    ]

    const finished = await Effect.runPromise(
      finishImport(job, "capped", { cursor, stats: FINAL_STATS, runs, error: "hit the ceiling" }).pipe(
        Effect.provide(h.layer),
      ),
    )

    expect(finished.cursor).toEqual(cursor)
    expect(finished.runs).toEqual(runs)
    expect(finished.error).toBe("hit the ceiling")
  })

  it("keeps the error already on the job when the patch carries none", async () => {
    const job = runningJob({ error: "a rate limit we waited out" })
    const h = importHarness({ seed: [job] })

    const finished = await Effect.runPromise(finishImport(job, "succeeded").pipe(Effect.provide(h.layer)))

    expect(finished.error).toBe("a rate limit we waited out")
  })

  describe("ImportFinished", () => {
    it("is emitted from the persisted row, not the copy the caller held", async () => {
      const job = runningJob()
      const h = importHarness({ seed: [job] })

      await Effect.runPromise(finishImport(job, "succeeded", { stats: FINAL_STATS }).pipe(Effect.provide(h.layer)))

      expect(h.written).toHaveLength(1)
      expect(h.written[0]).toMatchObject({
        eventName: "ImportFinished",
        aggregateType: "import-job",
        aggregateId: job.id,
        organizationId: STUB_IMPORT_ORGANIZATION_ID,
        payload: {
          organizationId: STUB_IMPORT_ORGANIZATION_ID,
          projectId: STUB_IMPORT_PROJECT_ID,
          importJobId: job.id,
          source: "langfuse",
          status: "succeeded",
          recordsFetched: 90,
          tracesImported: 30,
          spansImported: 88,
          spansSkipped: 2,
        },
      })
    })

    // Terminal transitions happen at nine points in the page loop; pairing the event with the
    // status write here is what stops one of them from silently skipping it.
    it.each(TERMINAL_STATUSES)("carries the %s status it wrote", async (status) => {
      const job = runningJob()
      const h = importHarness({ seed: [job] })

      await Effect.runPromise(finishImport(job, status).pipe(Effect.provide(h.layer)))

      expect(h.written).toHaveLength(1)
      expect(h.written[0]).toMatchObject({ payload: { status } })
    })

    it("reports why a capped run stopped, which is not a failure", async () => {
      const job = runningJob()
      const h = importHarness({ seed: [job] })

      await Effect.runPromise(
        finishImport(job, "capped", { error: "Ran out of plan usage" }).pipe(Effect.provide(h.layer)),
      )

      expect(h.written[0]).toMatchObject({ payload: { status: "capped", error: "Ran out of plan usage" } })
    })

    it("measures the duration from the job's own start", async () => {
      const job = runningJob()
      const h = importHarness({ seed: [job] })

      const finished = await Effect.runPromise(finishImport(job, "succeeded").pipe(Effect.provide(h.layer)))

      const durationMs = (h.written[0]?.payload as { durationMs: number }).durationMs
      expect(durationMs).toBe((finished.finishedAt as Date).getTime() - STARTED_AT.getTime())
      expect(durationMs).toBeGreaterThan(0)
    })

    it("reports a zero duration for a job that never started", async () => {
      const job = stubImportJob({ status: "queued", startedAt: null })
      const h = importHarness({ seed: [job] })

      await Effect.runPromise(finishImport(job, "cancelled").pipe(Effect.provide(h.layer)))

      expect(h.written[0]).toMatchObject({ payload: { durationMs: 0 } })
    })

    // The row is gone (a cascade delete raced the page), so the caller's copy is all there is.
    it("still emits when the row has vanished", async () => {
      const job = runningJob()
      const h = importHarness()

      await Effect.runPromise(finishImport(job, "failed", { error: "gone" }).pipe(Effect.provide(h.layer)))

      expect(h.written).toHaveLength(1)
      expect(h.written[0]).toMatchObject({ payload: { importJobId: job.id, status: "failed" } })
    })
  })
})
