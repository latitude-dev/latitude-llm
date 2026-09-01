import { generateId, ImportJobId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import type { ImportJob } from "../entities/import-job.ts"
import {
  importHarness,
  STUB_IMPORT_CREDENTIALS,
  STUB_IMPORT_ORGANIZATION_ID,
  STUB_IMPORT_PROJECT_ID,
  stubImportJob,
} from "../testing/harness.ts"
import { startImportUseCase } from "./start-import.ts"

interface Published {
  readonly organizationId: string
  readonly projectId: string
  readonly importJobId: string
}

const starter = (options: { readonly failWith?: Error } = {}) => {
  const published: Published[] = []
  const start = startImportUseCase({
    publish: (payload) => {
      if (options.failWith) return Effect.fail(options.failWith)
      return Effect.sync(() => published.push(payload))
    },
  })
  return { start, published }
}

/** What the `start` handler is handed: `enqueueImportUseCase` has already queued it. */
const queuedJob = (overrides: Partial<ImportJob> = {}) => stubImportJob({ status: "queued", ...overrides })

describe("startImportUseCase", () => {
  it("marks the job running, stamps startedAt, and publishes the first page", async () => {
    const job = queuedJob()
    const h = importHarness({ seed: [job] })
    const { start, published } = starter()

    await Effect.runPromise(start({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    const stored = h.stored.get(job.id)
    expect(stored?.status).toBe("running")
    expect(stored?.startedAt).toBeInstanceOf(Date)
    expect(published).toEqual([
      { organizationId: STUB_IMPORT_ORGANIZATION_ID, projectId: STUB_IMPORT_PROJECT_ID, importJobId: job.id },
    ])
  })

  it("returns the running row, not the queued copy it read", async () => {
    const job = queuedJob()
    const h = importHarness({ seed: [job] })
    const { start } = starter()

    const started = await Effect.runPromise(start({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(started.status).toBe("running")
    expect(started.startedAt).toEqual(h.stored.get(job.id)?.startedAt)
  })

  it("keeps the credentials the first page needs", async () => {
    const job = queuedJob()
    const h = importHarness({ seed: [job] })
    const { start } = starter()

    await Effect.runPromise(start({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(h.stored.get(job.id)?.credentials).toEqual(STUB_IMPORT_CREDENTIALS)
  })

  it("emits no event — the start was already recorded at creation", async () => {
    const job = queuedJob()
    const h = importHarness({ seed: [job] })
    const { start } = starter()

    await Effect.runPromise(start({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(h.written).toEqual([])
  })

  // `created` among them: a job only reaches the worker once `enqueueImportUseCase` has
  // queued it, so a `start` message naming one is stale and must not restart it.
  it.each([
    ["created" as const],
    ["running" as const],
    ["succeeded" as const],
    ["capped" as const],
    ["cancelled" as const],
    ["failed" as const],
  ])("does not re-publish a %s job", async (status) => {
    const job = stubImportJob({ status })
    const h = importHarness({ seed: [job] })
    const { start, published } = starter()

    const returned = await Effect.runPromise(start({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(published).toEqual([])
    expect(h.stored.get(job.id)?.status).toBe(status)
    expect(returned).toEqual(job)
  })

  it("fails when the job does not exist", async () => {
    const h = importHarness()
    const { start, published } = starter()

    const exit = await Effect.runPromiseExit(
      start({ importJobId: ImportJobId(generateId()) }).pipe(Effect.provide(h.layer)),
    )

    expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("ImportJobNotFoundError")
    expect(published).toEqual([])
  })

  // Without this the job would sit `running` forever with no page chain behind it.
  it("marks the job failed and clears credentials when publishing the first page fails", async () => {
    const job = queuedJob()
    const h = importHarness({ seed: [job] })
    const { start } = starter({ failWith: new Error("redis unavailable") })

    const exit = await Effect.runPromiseExit(start({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    expect(Exit.isFailure(exit)).toBe(true)
    const stored = h.stored.get(job.id)
    expect(stored?.status).toBe("failed")
    expect(stored?.error).toBe("Import queue publish failed")
    expect(stored?.finishedAt).toBeInstanceOf(Date)
    expect(stored?.startedAt).toBeInstanceOf(Date)
    expect(stored?.credentials).toBeNull()
  })

  it("records the publish failure without emitting ImportFinished", async () => {
    const job = queuedJob()
    const h = importHarness({ seed: [job] })
    const { start } = starter({ failWith: new Error("redis unavailable") })

    await Effect.runPromiseExit(start({ importJobId: job.id }).pipe(Effect.provide(h.layer)))

    // `markFailedIfActive` is a bare repository write, deliberately outside `finishImport`.
    expect(h.written).toEqual([])
  })
})
