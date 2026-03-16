import type { DatasetId, DatasetRowId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

// Known limitation: concurrent deletes/updates race on version number.
// See update-row.ts for details on the last-write-wins behavior.
export function deleteRows(args: { readonly datasetId: DatasetId; readonly rowIds: readonly DatasetRowId[] }) {
  return Effect.gen(function* () {
    if (args.rowIds.length === 0) return { versionId: null, version: 0 }

    const datasetRepo = yield* DatasetRepository
    const rowRepo = yield* DatasetRowRepository

    yield* Effect.all(
      args.rowIds.map((rowId) =>
        rowRepo.findById({
          datasetId: args.datasetId,
          rowId,
        }),
      ),
    )

    const version = yield* datasetRepo.incrementVersion({
      id: args.datasetId,
      rowsDeleted: args.rowIds.length,
      source: "web",
    })

    yield* rowRepo
      .deleteBatch({
        datasetId: args.datasetId,
        rowIds: args.rowIds,
        version: version.version,
      })
      .pipe(
        Effect.tapError(() =>
          datasetRepo.decrementVersion({
            id: args.datasetId,
            versionId: version.id,
          }),
        ),
      )

    return { versionId: version.id, version: version.version }
  })
}
