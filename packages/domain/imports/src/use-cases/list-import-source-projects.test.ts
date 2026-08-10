import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { IMPORT_SOURCE_PROJECT_LIST_LIMIT, IMPORT_SOURCE_PROJECT_LIST_MAX } from "../constants.ts"
import type { ImportSource } from "../entities/import-source.ts"
import { IMPORT_SOURCES } from "../entities/import-source.ts"
import { ImportSourceError } from "../errors.ts"
import { type ImportSourceAdapter, ImportSourceAdapters, type SourceProject } from "../ports/import-source-adapter.ts"
import { createFakeImportAdapterRegistry } from "../testing/fake-adapter.ts"
import { STUB_IMPORT_CREDENTIALS } from "../testing/harness.ts"
import { listImportSourceProjectsUseCase } from "./list-import-source-projects.ts"

const PROJECTS: readonly SourceProject[] = Array.from({ length: 600 }, (_, i) => ({
  id: `project-${i}`,
  name: `Project ${i}`,
}))

interface ListCall {
  readonly source: ImportSource
  readonly limit: number
  readonly cursor: string | undefined
}

const registryLayer = (options: { readonly failWith?: ImportSourceError; readonly nextCursor?: string } = {}) => {
  const calls: ListCall[] = []
  const { registry } = createFakeImportAdapterRegistry()

  const instrument = (adapter: ImportSourceAdapter<unknown, unknown>): ImportSourceAdapter<unknown, unknown> => ({
    ...adapter,
    listProjects: ({ limit, cursor }) => {
      calls.push({ source: adapter.source, limit, cursor })
      if (options.failWith) return Effect.fail(options.failWith)
      return Effect.succeed({
        projects: PROJECTS.slice(0, limit),
        nextCursor: options.nextCursor ?? null,
      })
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

const list = (input: { readonly cursor?: string; readonly limit?: number } = {}) =>
  listImportSourceProjectsUseCase({
    source: "langfuse",
    credentials: STUB_IMPORT_CREDENTIALS,
    ...input,
  })

describe("listImportSourceProjectsUseCase", () => {
  it("returns the adapter's projects and its continuation cursor", async () => {
    const { layer } = registryLayer({ nextCursor: "page-2" })

    const result = await Effect.runPromise(list({ limit: 2 }).pipe(Effect.provide(layer)))

    expect(result.projects).toEqual([PROJECTS[0], PROJECTS[1]])
    expect(result.nextCursor).toBe("page-2")
  })

  it("reports no cursor when the source has nothing more to give", async () => {
    const { layer } = registryLayer()

    const result = await Effect.runPromise(list({ limit: 2 }).pipe(Effect.provide(layer)))

    expect(result.nextCursor).toBeNull()
  })

  describe("limits", () => {
    it("asks for the default page size when none is given", async () => {
      const { layer, calls } = registryLayer()

      await Effect.runPromise(list().pipe(Effect.provide(layer)))

      expect(calls[0]?.limit).toBe(IMPORT_SOURCE_PROJECT_LIST_LIMIT)
    })

    it("passes a caller's smaller limit through untouched", async () => {
      const { layer, calls } = registryLayer()

      await Effect.runPromise(list({ limit: 5 }).pipe(Effect.provide(layer)))

      expect(calls[0]?.limit).toBe(5)
    })

    // A source with thousands of projects must not turn one wizard step into an unbounded read.
    it("clamps a limit above the ceiling", async () => {
      const { layer, calls } = registryLayer()

      await Effect.runPromise(list({ limit: IMPORT_SOURCE_PROJECT_LIST_MAX * 10 }).pipe(Effect.provide(layer)))

      expect(calls[0]?.limit).toBe(IMPORT_SOURCE_PROJECT_LIST_MAX)
    })

    it("keeps the ceiling above the default, so the default is reachable", () => {
      expect(IMPORT_SOURCE_PROJECT_LIST_MAX).toBeGreaterThanOrEqual(IMPORT_SOURCE_PROJECT_LIST_LIMIT)
    })
  })

  describe("pagination", () => {
    it("forwards the cursor it was handed", async () => {
      const { layer, calls } = registryLayer()

      await Effect.runPromise(list({ cursor: "page-2" }).pipe(Effect.provide(layer)))

      expect(calls[0]?.cursor).toBe("page-2")
    })

    // Omitted rather than passed as undefined: a source that sees the key at all may treat
    // it as a request for a page that does not exist.
    it("omits the cursor entirely on the first page", async () => {
      const { layer, calls } = registryLayer()

      await Effect.runPromise(list().pipe(Effect.provide(layer)))

      expect(calls[0]?.cursor).toBeUndefined()
    })
  })

  it.each(IMPORT_SOURCES.map((source) => [source]))("routes to the %s adapter", async (source) => {
    const { layer, calls } = registryLayer()

    await Effect.runPromise(
      listImportSourceProjectsUseCase({ source, credentials: STUB_IMPORT_CREDENTIALS }).pipe(Effect.provide(layer)),
    )

    expect(calls.map((call) => call.source)).toEqual([source])
  })

  it("propagates the adapter's error rather than swallowing it", async () => {
    const { layer } = registryLayer({
      failWith: new ImportSourceError({ category: "auth", message: "bad key", retryable: false }),
    })

    const exit = await Effect.runPromiseExit(list().pipe(Effect.provide(layer)))

    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)).toContain("ImportSourceError")
  })
})
