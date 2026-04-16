import type { DatasetId, DatasetRowId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

export type DeleteRowsSelection =
  | { readonly mode: "selected"; readonly rowIds: readonly DatasetRowId[] }
  | { readonly mode: "all" }
  | { readonly mode: "allExcept"; readonly rowIds: readonly DatasetRowId[] }

// Known limitation: concurrent deletes/updates race on version number.
// See update-row.ts for details on the last-write-wins behavior.
export function deleteRows(args: { readonly datasetId: DatasetId; readonly selection: DeleteRowsSelection }) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)

    if (args.selection.mode === "selected" && args.selection.rowIds.length === 0) {
      return { versionId: null, version: 0 }
    }

    const datasetRepo = yield* DatasetRepository
    const rowRepo = yield* DatasetRowRepository

    if (args.selection.mode === "selected") {
      yield* Effect.all(args.selection.rowIds.map((rowId) => rowRepo.findById({ datasetId: args.datasetId, rowId })))

      const version = yield* datasetRepo.incrementVersion({
        id: args.datasetId,
        rowsDeleted: args.selection.rowIds.length,
        source: "web",
      })

      yield* rowRepo
        .deleteBatch({
          datasetId: args.datasetId,
          rowIds: args.selection.rowIds,
          version: version.version,
        })
        .pipe(Effect.tapError(() => datasetRepo.decrementVersion({ id: args.datasetId, versionId: version.id })))

      return { versionId: version.id, version: version.version }
    }

    const version = yield* datasetRepo.incrementVersion({
      id: args.datasetId,
      source: "web",
    })

    const deleteAllArgs =
      args.selection.mode === "allExcept"
        ? { datasetId: args.datasetId, version: version.version, excludedRowIds: args.selection.rowIds }
        : { datasetId: args.datasetId, version: version.version }

    const deletedCount = yield* rowRepo
      .deleteAll(deleteAllArgs)
      .pipe(Effect.tapError(() => datasetRepo.decrementVersion({ id: args.datasetId, versionId: version.id })))

    return { versionId: version.id, version: version.version, deletedCount }
  }).pipe(Effect.withSpan("datasets.deleteRows"))
}
