import type { DatasetExportPayload, ExportSelection } from "@domain/exports"
import type { DatasetId } from "@domain/shared"
import { Effect } from "effect"
import { DATASET_DOWNLOAD_DIRECT_THRESHOLD } from "../constants.ts"
import { sanitizeDatasetFilename } from "../export-csv.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { buildDatasetExportUseCase } from "./build-dataset-export.ts"
import { countRows } from "./count-rows.ts"

export interface PrepareDatasetExportInput {
  readonly datasetId: DatasetId
  readonly selection: ExportSelection
  readonly organizationId: string
  readonly recipientEmail: string
}

export type PrepareDatasetExportResult =
  | {
      readonly kind: "direct"
      readonly csv: string
      readonly filename: string
      readonly exportName: string
    }
  | {
      readonly kind: "needsEnqueue"
      readonly payload: DatasetExportPayload
    }

/**
 * Decides between the inline-CSV path and the async email flow. Returns the CSV
 * inline when the export is safe to generate on the request thread; otherwise
 * returns the queue payload the caller should publish. The use case does not
 * itself publish — the queue publisher and any rate limiting live one layer
 * up, in the caller, so the direct path never pays the queue/Redis init cost.
 *
 * The threshold gates two distinct quantities:
 * - `expectedRowCount` — rows the export will actually contain (selection-aware).
 * - `total` — rows in the dataset overall. We have to check this too because
 *   `buildDatasetExportUseCase` paginates the entire dataset for any non-"all"
 *   selection and filters in memory; a 5-row `selected` export from a 100k-row
 *   dataset would otherwise sync-scan the whole table on the request thread.
 */
export const prepareDatasetExportUseCase = Effect.fn("datasets.prepareDatasetExport")(function* (
  input: PrepareDatasetExportInput,
) {
  yield* Effect.annotateCurrentSpan("datasetId", input.datasetId)

  const datasetRepo = yield* DatasetRepository
  const dataset = yield* datasetRepo.findById(input.datasetId)
  const total = yield* countRows({ datasetId: input.datasetId })

  let expectedRowCount: number
  switch (input.selection.mode) {
    case "selected":
      expectedRowCount = input.selection.rowIds.length
      break
    case "allExcept":
      expectedRowCount = Math.max(0, total - input.selection.rowIds.length)
      break
    case "all":
      expectedRowCount = total
      break
  }
  yield* Effect.annotateCurrentSpan("expectedRowCount", expectedRowCount)
  yield* Effect.annotateCurrentSpan("totalRowCount", total)

  const fitsInRequest =
    expectedRowCount <= DATASET_DOWNLOAD_DIRECT_THRESHOLD && total <= DATASET_DOWNLOAD_DIRECT_THRESHOLD

  if (fitsInRequest) {
    const { csv, exportName } = yield* buildDatasetExportUseCase({
      datasetId: input.datasetId,
      selection: input.selection,
    })
    return {
      kind: "direct" as const,
      csv,
      filename: `${sanitizeDatasetFilename(dataset.name)}.csv`,
      exportName,
    } satisfies PrepareDatasetExportResult
  }

  const payload: DatasetExportPayload = {
    kind: "dataset",
    datasetId: input.datasetId as string,
    selection: input.selection,
    organizationId: input.organizationId,
    projectId: dataset.projectId,
    recipientEmail: input.recipientEmail,
  }
  return { kind: "needsEnqueue" as const, payload } satisfies PrepareDatasetExportResult
})
