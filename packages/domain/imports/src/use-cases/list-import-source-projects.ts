import { Effect } from "effect"
import { IMPORT_SOURCE_PROJECT_LIST_LIMIT, IMPORT_SOURCE_PROJECT_LIST_MAX } from "../constants.ts"
import type { ImportCredentials, ImportSource } from "../entities/import-source.ts"
import { getAdapter, ImportSourceAdapters } from "../ports/import-source-adapter.ts"

interface ListImportSourceProjectsInput {
  readonly source: ImportSource
  readonly credentials: ImportCredentials
  readonly cursor?: string
  readonly limit?: number
}

export const listImportSourceProjectsUseCase = (input: ListImportSourceProjectsInput) =>
  Effect.gen(function* () {
    const adapters = yield* ImportSourceAdapters
    const adapter = getAdapter(adapters, input.source)
    return yield* adapter.listProjects({
      credentials: input.credentials,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      limit: Math.min(input.limit ?? IMPORT_SOURCE_PROJECT_LIST_LIMIT, IMPORT_SOURCE_PROJECT_LIST_MAX),
    })
  }).pipe(Effect.withSpan("imports.listSourceProjects"))
