import { Effect } from "effect"
import type { ImportCredentials, ImportSource } from "../entities/import-source.ts"
import { getAdapter, ImportSourceAdapters } from "../ports/import-source-adapter.ts"

interface TestImportConnectionInput {
  readonly source: ImportSource
  readonly credentials: ImportCredentials
}

export const testImportConnectionUseCase = (input: TestImportConnectionInput) =>
  Effect.gen(function* () {
    const adapters = yield* ImportSourceAdapters
    const adapter = getAdapter(adapters, input.source)
    yield* adapter.testConnection({ credentials: input.credentials })
  }).pipe(Effect.withSpan("imports.testConnection"))
