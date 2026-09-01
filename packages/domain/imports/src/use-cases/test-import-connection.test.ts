import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { ImportCredentials, ImportSource } from "../entities/import-source.ts"
import { IMPORT_SOURCES } from "../entities/import-source.ts"
import { ImportSourceError } from "../errors.ts"
import { type ImportSourceAdapter, ImportSourceAdapters } from "../ports/import-source-adapter.ts"
import { createFakeImportAdapterRegistry } from "../testing/fake-adapter.ts"
import { STUB_IMPORT_CREDENTIALS } from "../testing/harness.ts"
import { testImportConnectionUseCase } from "./test-import-connection.ts"

const AUTH_ERROR = new ImportSourceError({
  category: "auth",
  message: "authentication failed",
  retryable: false,
  upstreamStatus: 401,
})

/** Records which adapter was asked, and with what, so routing is assertable. */
const registryLayer = (options: { readonly failWith?: ImportSourceError } = {}) => {
  const calls: { readonly source: ImportSource; readonly credentials: ImportCredentials }[] = []
  const { registry } = createFakeImportAdapterRegistry()

  const instrument = (adapter: ImportSourceAdapter<unknown, unknown>): ImportSourceAdapter<unknown, unknown> => ({
    ...adapter,
    testConnection: ({ credentials }) => {
      calls.push({ source: adapter.source, credentials })
      return options.failWith ? Effect.fail(options.failWith) : Effect.void
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

describe("testImportConnectionUseCase", () => {
  it("succeeds when the adapter accepts the credentials", async () => {
    const { layer } = registryLayer()

    const exit = await Effect.runPromiseExit(
      testImportConnectionUseCase({ source: "langfuse", credentials: STUB_IMPORT_CREDENTIALS }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("hands the credentials straight to the adapter", async () => {
    const { layer, calls } = registryLayer()

    await Effect.runPromise(
      testImportConnectionUseCase({ source: "langfuse", credentials: STUB_IMPORT_CREDENTIALS }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(calls).toEqual([{ source: "langfuse", credentials: STUB_IMPORT_CREDENTIALS }])
  })

  it.each(IMPORT_SOURCES.map((source) => [source]))("routes to the %s adapter", async (source) => {
    const { layer, calls } = registryLayer()

    await Effect.runPromise(
      testImportConnectionUseCase({ source, credentials: STUB_IMPORT_CREDENTIALS }).pipe(Effect.provide(layer)),
    )

    expect(calls.map((call) => call.source)).toEqual([source])
  })

  // The wizard shows this against the credentials step, so it has to stay a typed failure.
  it("propagates the adapter's error rather than swallowing it", async () => {
    const { layer } = registryLayer({ failWith: AUTH_ERROR })

    const exit = await Effect.runPromiseExit(
      testImportConnectionUseCase({ source: "langfuse", credentials: STUB_IMPORT_CREDENTIALS }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    const cause = JSON.stringify(Exit.isFailure(exit) ? exit.cause : null)
    expect(cause).toContain("ImportSourceError")
    expect(cause).toContain("auth")
    expect(cause).not.toContain("Die")
  })
})
