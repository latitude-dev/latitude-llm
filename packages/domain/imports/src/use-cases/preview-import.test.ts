import { Effect, Exit, Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { IMPORT_DRY_RUN_MAX_RECORDS, IMPORT_DRY_RUN_TIMEOUT_MS } from "../constants.ts"
import type { ImportPreviewConfig, ImportSource } from "../entities/import-source.ts"
import { IMPORT_SOURCES } from "../entities/import-source.ts"
import { ImportSourceError } from "../errors.ts"
import { type ImportPreview, type ImportSourceAdapter, ImportSourceAdapters } from "../ports/import-source-adapter.ts"
import { createFakeImportAdapterRegistry } from "../testing/fake-adapter.ts"
import { STUB_IMPORT_CREDENTIALS, stubImportConfig } from "../testing/harness.ts"
import { previewImportUseCase } from "./preview-import.ts"

const CONFIG: ImportPreviewConfig = stubImportConfig({ maxTraces: 500 })

const PREVIEW: ImportPreview = {
  estimatedTraces: 42,
  sample: [
    {
      traceId: "trace-1",
      spanId: "span-1",
      name: "chat completion",
      sessionId: "session-1",
      userId: "user-1",
      operation: "chat",
      model: "claude",
      tags: ["prod"],
      startTime: "2026-01-05T10:00:00.000Z",
    },
  ],
  warnings: ["No total row count is available for this source."],
}

interface PreviewCall {
  readonly source: ImportSource
  readonly sourceProjectId: string
  readonly range: { readonly from: Date; readonly to: Date }
  readonly maxRecords: number
  readonly config: ImportPreviewConfig
}

const registryLayer = (options: { readonly failWith?: ImportSourceError; readonly hang?: boolean } = {}) => {
  const calls: PreviewCall[] = []
  const { registry } = createFakeImportAdapterRegistry()

  const instrument = (adapter: ImportSourceAdapter<unknown, unknown>): ImportSourceAdapter<unknown, unknown> => ({
    ...adapter,
    preview: ({ sourceProjectId, range, maxRecords, config }) => {
      calls.push({ source: adapter.source, sourceProjectId, range, maxRecords, config })
      if (options.failWith) return Effect.fail(options.failWith)
      if (options.hang) return Effect.never
      return Effect.succeed(PREVIEW)
    },
  })

  return {
    calls,
    layer: Layer.succeed(ImportSourceAdapters, {
      langfuse: instrument(registry.langfuse),
      langsmith: instrument(registry.langsmith),
      braintrust: instrument(registry.braintrust),
    }),
  }
}

const preview = (source: ImportSource = "langfuse") =>
  previewImportUseCase({
    source,
    credentials: STUB_IMPORT_CREDENTIALS,
    sourceProjectId: "lf-project",
    config: CONFIG,
  })

describe("previewImportUseCase", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the adapter's sample and warnings unchanged", async () => {
    const { layer } = registryLayer()

    const result = await Effect.runPromise(preview().pipe(Effect.provide(layer)))

    expect(result).toEqual(PREVIEW)
  })

  it("previews the project the user picked", async () => {
    const { layer, calls } = registryLayer()

    await Effect.runPromise(preview().pipe(Effect.provide(layer)))

    expect(calls[0]?.sourceProjectId).toBe("lf-project")
  })

  // The range lives on the config, so the dry run reads exactly the window the job would.
  it("derives the range from the config", async () => {
    const { layer, calls } = registryLayer()

    await Effect.runPromise(preview().pipe(Effect.provide(layer)))

    expect(calls[0]?.range).toEqual({ from: CONFIG.rangeFrom, to: CONFIG.rangeTo })
  })

  it("bounds the scan by the dry-run record budget, not by the import's trace ceiling", async () => {
    const { layer, calls } = registryLayer()

    await Effect.runPromise(preview().pipe(Effect.provide(layer)))

    expect(calls[0]?.maxRecords).toBe(IMPORT_DRY_RUN_MAX_RECORDS)
    expect(calls[0]?.config.maxTraces).toBe(500)
  })

  it.each(IMPORT_SOURCES.map((source) => [source]))("routes to the %s adapter", async (source) => {
    const { layer, calls } = registryLayer()

    await Effect.runPromise(preview(source).pipe(Effect.provide(layer)))

    expect(calls.map((call) => call.source)).toEqual([source])
  })

  it("propagates the adapter's error rather than swallowing it", async () => {
    const { layer } = registryLayer({
      failWith: new ImportSourceError({ category: "config", message: "unknown project", retryable: false }),
    })

    const exit = await Effect.runPromiseExit(preview().pipe(Effect.provide(layer)))

    expect(Exit.isFailure(exit)).toBe(true)
    const cause = JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)
    expect(cause).toContain("unknown project")
    expect(cause).not.toContain("Die")
  })

  // A wizard step cannot hang on a slow source: the budget turns it into a retryable error.
  it("converts a hung source into a retryable transport error", async () => {
    vi.useFakeTimers()
    const { layer } = registryLayer({ hang: true })

    const exit = Effect.runPromiseExit(preview().pipe(Effect.provide(layer)))
    await vi.advanceTimersByTimeAsync(IMPORT_DRY_RUN_TIMEOUT_MS)

    const settled = await exit
    expect(Exit.isFailure(settled)).toBe(true)
    const cause = JSON.stringify(Exit.isFailure(settled) ? settled.cause : null)
    expect(cause).toContain("Preview timed out")
    expect(cause).toContain("transport")
  })

  it("does not time out a source that answers inside the budget", async () => {
    vi.useFakeTimers()
    const { layer } = registryLayer()

    const running = Effect.runPromise(preview().pipe(Effect.provide(layer)))
    await vi.advanceTimersByTimeAsync(IMPORT_DRY_RUN_TIMEOUT_MS - 1)

    await expect(running).resolves.toEqual(PREVIEW)
  })

  it("keeps the dry-run budget below the engine's page budget", () => {
    // A preview that outlived a page would be a worse wizard experience than the import itself.
    expect(IMPORT_DRY_RUN_TIMEOUT_MS).toBe(30_000)
  })
})
