import { generateId, ImportJobId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { importHarness, STUB_IMPORT_CREDENTIALS, stubImportJob } from "../testing/harness.ts"
import { cancelImportUseCase } from "./cancel-import.ts"

describe("cancelImportUseCase", () => {
  it.each([["queued" as const], ["running" as const]])("marks a %s job for cancellation", async (status) => {
    const job = stubImportJob({ status })
    const h = importHarness({ seed: [job] })

    await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    const stored = h.stored.get(job.id)
    expect(stored?.cancelledAt).toBeInstanceOf(Date)
    // Cancellation is cooperative: the worker flips the status between pages.
    expect(stored?.status).toBe(status)
  })

  it("returns the stamped job rather than the copy it read", async () => {
    const job = stubImportJob({ status: "running" })
    const h = importHarness({ seed: [job] })

    const cancelled = await Effect.runPromise(
      cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)),
    )

    expect(cancelled.cancelledAt).toBeInstanceOf(Date)
    expect(cancelled.cancelledAt).toEqual(h.stored.get(job.id)?.cancelledAt)
  })

  // The worker needs them to settle the job on its next page, where the cancellation is
  // observed; `finishImport` is what scrubs them.
  it("leaves the credentials in place for the worker to settle with", async () => {
    const job = stubImportJob({ status: "running" })
    const h = importHarness({ seed: [job] })

    await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(job.id)?.credentials).toEqual(STUB_IMPORT_CREDENTIALS)
  })

  // `ImportFinished` is emitted once the worker actually settles the job, not here.
  it("emits no event, because nothing has finished yet", async () => {
    const job = stubImportJob({ status: "running" })
    const h = importHarness({ seed: [job] })

    await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(h.written).toEqual([])
  })

  it.each([
    ["succeeded" as const],
    ["capped" as const],
    ["cancelled" as const],
    ["failed" as const],
  ])("leaves a %s job untouched", async (status) => {
    const job = stubImportJob({ status })
    const h = importHarness({ seed: [job] })

    const returned = await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(job.id)?.cancelledAt).toBeNull()
    expect(returned).toEqual(job)
  })

  // No worker would ever observe a stamp on a job that was never queued, so this one is
  // settled outright rather than left for the page loop to notice.
  describe("a created job", () => {
    it("is settled terminally instead of stamped", async () => {
      const job = stubImportJob()
      const h = importHarness({ seed: [job] })

      const cancelled = await Effect.runPromise(
        cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)),
      )

      expect(cancelled.status).toBe("cancelled")
      expect(cancelled.finishedAt).toBeInstanceOf(Date)
      expect(h.stored.get(job.id)?.status).toBe("cancelled")
    })

    it("has its credentials scrubbed, since nothing will authenticate with them", async () => {
      const job = stubImportJob()
      const h = importHarness({ seed: [job] })

      await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

      expect(h.stored.get(job.id)?.credentials).toBeNull()
    })

    // `created` claims the slot through the `..._org_active_uq` predicate, and no other path
    // can clear a job that never reached the queue.
    it("frees the org's import slot", async () => {
      const job = stubImportJob()
      const h = importHarness({ seed: [job] })

      await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))
      const active = await Effect.runPromise(h.repository.findActive().pipe(Effect.provide(h.layer)))

      expect(active).toBeNull()
    })

    it("emits the ImportFinished that balances its ImportStarted", async () => {
      const job = stubImportJob()
      const h = importHarness({ seed: [job] })

      await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

      expect(h.written).toHaveLength(1)
      expect(h.written[0]).toMatchObject({
        eventName: "ImportFinished",
        aggregateId: job.id,
        payload: { importJobId: job.id, status: "cancelled", durationMs: 0 },
      })
    })
  })

  it("re-stamps a job that is cancelled twice while still running", async () => {
    const job = stubImportJob({ status: "running" })
    const h = importHarness({ seed: [job] })

    const first = await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))
    const second = await Effect.runPromise(cancelImportUseCase({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(first.cancelledAt).toBeInstanceOf(Date)
    expect(second.cancelledAt).toBeInstanceOf(Date)
    expect(h.stored.get(job.id)?.status).toBe("running")
  })

  it("fails when the job does not exist", async () => {
    const h = importHarness()

    const exit = await Effect.runPromiseExit(
      cancelImportUseCase({ importJobId: ImportJobId(generateId()) }).pipe(Effect.provide(h.layer)),
    )

    expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("ImportJobNotFoundError")
  })
})
