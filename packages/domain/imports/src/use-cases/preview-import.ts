import { Effect } from "effect"
import { IMPORT_DRY_RUN_MAX_RECORDS, IMPORT_DRY_RUN_TIMEOUT_MS } from "../constants.ts"
import type { ImportCredentials, ImportPreviewConfig, ImportSource } from "../entities/import-source.ts"
import { ImportSourceError } from "../errors.ts"
import { getAdapter, ImportSourceAdapters } from "../ports/import-source-adapter.ts"

interface PreviewImportInput {
  readonly source: ImportSource
  readonly credentials: ImportCredentials
  readonly sourceProjectId: string
  readonly config: ImportPreviewConfig
}

export const previewImportUseCase = (input: PreviewImportInput) =>
  Effect.gen(function* () {
    const adapters = yield* ImportSourceAdapters
    const adapter = getAdapter(adapters, input.source)

    const previewEffect = adapter.preview({
      credentials: input.credentials,
      sourceProjectId: input.sourceProjectId,
      config: input.config,
      range: { from: input.config.rangeFrom, to: input.config.rangeTo },
      maxRecords: IMPORT_DRY_RUN_MAX_RECORDS,
    })

    return yield* previewEffect.pipe(
      Effect.timeout(`${IMPORT_DRY_RUN_TIMEOUT_MS} millis`),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(
          new ImportSourceError({
            category: "transport",
            message: "Preview timed out",
            retryable: true,
          }),
        ),
      ),
    )
  }).pipe(Effect.withSpan("imports.preview"))
