import { buildDatasetExportFilename, type ExportSelection } from "@domain/exports"
import { type DatasetId, DatasetRowId } from "@domain/shared"
import { Effect } from "effect"
import { csvExportHeader, rowsToCsvFragment } from "../export-csv.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

const BATCH_SIZE = 1000

export interface BuildDatasetExportInput {
  readonly datasetId: DatasetId
  readonly selection: ExportSelection
}

export interface BuildDatasetExportResult {
  readonly csv: string
  readonly filename: string
  readonly exportName: string
}

export const buildDatasetExportUseCase = Effect.fn("datasets.buildDatasetExport")(function* (
  input: BuildDatasetExportInput,
) {
  yield* Effect.annotateCurrentSpan("datasetId", input.datasetId)

  const datasetRepo = yield* DatasetRepository
  const dataset = yield* datasetRepo.findById(input.datasetId)

  const rowRepo = yield* DatasetRowRepository
  const csvChunks: string[] = [csvExportHeader()]

  if (input.selection.mode !== "all") {
    const allRows = []
    let offset = 0

    while (true) {
      const rows = yield* rowRepo.listPage({
        datasetId: input.datasetId,
        limit: BATCH_SIZE,
        offset,
      })
      if (rows.length === 0) break

      allRows.push(...rows)
      if (rows.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }

    const selectedIds = new Set(input.selection.rowIds.map((id) => DatasetRowId(id)))
    const filteredRows =
      input.selection.mode === "selected"
        ? allRows.filter((row) => selectedIds.has(row.rowId))
        : allRows.filter((row) => !selectedIds.has(row.rowId))

    if (filteredRows.length > 0) {
      csvChunks.push(rowsToCsvFragment(filteredRows))
    }
  } else {
    let offset = 0

    while (true) {
      const rows = yield* rowRepo.listPage({
        datasetId: input.datasetId,
        limit: BATCH_SIZE,
        offset,
      })
      if (rows.length === 0) break

      csvChunks.push(rowsToCsvFragment(rows))
      if (rows.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }
  }

  return {
    csv: csvChunks.join("\n"),
    filename: buildDatasetExportFilename(dataset.name),
    exportName: dataset.name,
  } satisfies BuildDatasetExportResult
})
