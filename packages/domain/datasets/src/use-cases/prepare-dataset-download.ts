import type { ExportSelection } from "@domain/exports"
import { type DatasetId, type OrganizationId, ProjectId, putInDisk, StorageDisk, StorageError } from "@domain/shared"
import { Effect } from "effect"
import { DATASET_DOWNLOAD_DIRECT_THRESHOLD } from "../constants.ts"
import { sanitizeDatasetFilename } from "../export-csv.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { buildDatasetExportUseCase } from "./build-dataset-export.ts"
import { countRows } from "./count-rows.ts"

const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60 // 1 hour — short, since this is a synchronous sibling of the email flow.

export interface PrepareDatasetDownloadInput {
  readonly datasetId: DatasetId
  readonly organizationId: OrganizationId
  readonly selection: ExportSelection
}

export type PrepareDatasetDownloadResult =
  | {
      readonly kind: "ready"
      readonly downloadUrl: string
      readonly filename: string
      readonly expiresAt: string
      readonly rowCount: number
    }
  | {
      readonly kind: "tooLarge"
      readonly rowCount: number
      readonly threshold: number
    }

/**
 * Sibling of `prepareDatasetExportUseCase` for API / MCP / SDK callers that don't
 * have a browser to receive an inline CSV. At or below
 * `DATASET_DOWNLOAD_DIRECT_THRESHOLD` it writes the CSV to object storage and
 * returns a short-lived signed URL; above the threshold it returns a `tooLarge`
 * signal so the caller can route to the async email flow instead. There is no
 * queue dependency here — this use case never emails.
 *
 * The threshold gates two distinct quantities:
 * - `expectedRowCount` — rows the export will actually contain (selection-aware).
 * - `total` — rows in the dataset overall. We have to check this too because
 *   `buildDatasetExportUseCase` paginates the entire dataset for any non-"all"
 *   selection and filters in memory; a 5-row `selected` export from a 100k-row
 *   dataset would otherwise sync-scan the whole table on the request thread.
 */
export const prepareDatasetDownloadUseCase = Effect.fn("datasets.prepareDatasetDownload")(function* (
  input: PrepareDatasetDownloadInput,
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

  if (expectedRowCount > DATASET_DOWNLOAD_DIRECT_THRESHOLD || total > DATASET_DOWNLOAD_DIRECT_THRESHOLD) {
    return {
      kind: "tooLarge" as const,
      rowCount: expectedRowCount,
      threshold: DATASET_DOWNLOAD_DIRECT_THRESHOLD,
    } satisfies PrepareDatasetDownloadResult
  }

  const { csv } = yield* buildDatasetExportUseCase({
    datasetId: input.datasetId,
    selection: input.selection,
  })

  const filename = `${sanitizeDatasetFilename(dataset.name)}.csv`
  const disk = yield* StorageDisk
  const fileKey = yield* putInDisk(disk, {
    namespace: "exports",
    organizationId: input.organizationId,
    projectId: ProjectId(dataset.projectId),
    content: csv,
    filename,
  })

  const expiresAtMs = Date.now() + DOWNLOAD_URL_EXPIRY_SECONDS * 1000
  const downloadUrl = yield* Effect.tryPromise({
    try: () => disk.getSignedUrl(fileKey, { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS }),
    catch: (cause) => new StorageError({ cause, operation: "getSignedUrl" }),
  })

  return {
    kind: "ready" as const,
    downloadUrl,
    filename,
    expiresAt: new Date(expiresAtMs).toISOString(),
    rowCount: expectedRowCount,
  } satisfies PrepareDatasetDownloadResult
})
