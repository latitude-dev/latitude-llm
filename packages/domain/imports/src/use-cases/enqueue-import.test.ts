import { generateId, ImportJobId } from "@domain/shared"
import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import {
  importHarness,
  STUB_IMPORT_CREDENTIALS,
  STUB_IMPORT_ORGANIZATION_ID,
  STUB_IMPORT_PROJECT_ID,
  stubImportJob,
} from "../testing/harness.ts"
import { enqueueImportUseCase } from "./enqueue-import.ts"

interface Published {
  readonly organizationId: string
  readonly projectId: string
  readonly importJobId: string
}

const enqueuer = (options: { readonly failWith?: Error } = {}) => {
  const published: Published[] = []
  const enqueue = enqueueImportUseCase({
    publish: (payload) => {
      if (options.failWith) return Effect.fail(options.failWith)
      published.push(payload)
      return Effect.void
    },
  })
  return { enqueue, published }
}

const causeOf = (exit: Exit.Exit<unknown, unknown>) => JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)

describe("enqueueImportUseCase", () => {
  it("moves a created job to queued and hands it to the worker", async () => {
    const job = stubImportJob()
    const h = importHarness({ seed: [job] })
    const { enqueue, published } = enqueuer()

    const enqueued = await Effect.runPromise(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(enqueued.id).toBe(job.id)
    expect(enqueued.status).toBe("queued")
    expect(h.stored.get(job.id)?.status).toBe("queued")
    expect(published).toEqual([
      { organizationId: STUB_IMPORT_ORGANIZATION_ID, projectId: STUB_IMPORT_PROJECT_ID, importJobId: job.id },
    ])
  })

  it("publishes exactly one message", async () => {
    const job = stubImportJob()
    const h = importHarness({ seed: [job] })
    const { enqueue, published } = enqueuer()

    await Effect.runPromise(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(published).toHaveLength(1)
  })

  it("leaves the credentials for the worker to authenticate with", async () => {
    const job = stubImportJob()
    const h = importHarness({ seed: [job] })
    const { enqueue } = enqueuer()

    const enqueued = await Effect.runPromise(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(enqueued.credentials).toEqual(STUB_IMPORT_CREDENTIALS)
  })

  // Creation and retry are the only writers of `created`, and this is the only writer of
  // `queued`, so the status alone is what makes enqueueing exactly-once.
  it("touches nothing else on the job", async () => {
    const job = stubImportJob()
    const h = importHarness({ seed: [job] })
    const { enqueue } = enqueuer()

    const enqueued = await Effect.runPromise(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(enqueued).toMatchObject({
      id: job.id,
      cursor: job.cursor,
      stats: job.stats,
      runs: job.runs,
      error: null,
      startedAt: null,
      finishedAt: null,
      cancelledAt: null,
    })
  })

  it("emits no event — enqueueing is not an analytics moment", async () => {
    const job = stubImportJob()
    const h = importHarness({ seed: [job] })
    const { enqueue } = enqueuer()

    await Effect.runPromise(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(h.written).toEqual([])
  })

  // `queued` among them: a second enqueue of the same job is a bug rather than a no-op.
  it.each([
    ["queued" as const],
    ["running" as const],
    ["succeeded" as const],
    ["capped" as const],
    ["cancelled" as const],
    ["failed" as const],
  ])("refuses to enqueue a %s job and publishes nothing", async (status) => {
    const job = stubImportJob({ status })
    const h = importHarness({ seed: [job] })
    const { enqueue, published } = enqueuer()

    const exit = await Effect.runPromiseExit(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(causeOf(exit)).toContain("ImportJobNotEnqueueableError")
    expect(causeOf(exit)).toContain(status)
    expect(published).toEqual([])
    expect(h.stored.get(job.id)?.status).toBe(status)
  })

  it("refuses a second enqueue of the same job", async () => {
    const job = stubImportJob()
    const h = importHarness({ seed: [job] })
    const { enqueue, published } = enqueuer()

    await Effect.runPromise(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))
    const exit = await Effect.runPromiseExit(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(causeOf(exit)).toContain("ImportJobNotEnqueueableError")
    expect(published).toHaveLength(1)
  })

  it("fails when the job does not exist", async () => {
    const h = importHarness()
    const { enqueue, published } = enqueuer()

    const exit = await Effect.runPromiseExit(
      enqueue({ importJobId: ImportJobId(generateId()) }).pipe(Effect.provide(h.layer)),
    )

    expect(causeOf(exit)).toContain("ImportJobNotFoundError")
    expect(published).toEqual([])
  })

  describe("when the publish fails", () => {
    // The status is already committed by this point, so it cannot roll back. Settling the job
    // is what stops a `queued` row with no worker message behind it from holding the org's
    // one import slot forever.
    it("settles the job rather than leaving it queued with no message behind it", async () => {
      const job = stubImportJob()
      const h = importHarness({ seed: [job] })
      const { enqueue } = enqueuer({ failWith: new Error("redis unavailable") })

      await Effect.runPromiseExit(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

      const settled = h.stored.get(job.id)
      expect(settled?.status).toBe("failed")
      expect(settled?.error).toBe("Import queue publish failed")
      expect(settled?.finishedAt).not.toBeNull()
    })

    it("surfaces the failure instead of reporting the job as enqueued", async () => {
      const job = stubImportJob()
      const h = importHarness({ seed: [job] })
      const failure = new Error("redis unavailable")
      const { enqueue, published } = enqueuer({ failWith: failure })

      const exit = await Effect.runPromiseExit(enqueue({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : null).toBe(failure)
      expect(published).toEqual([])
    })
  })
})
