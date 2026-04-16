import type { DatasetId, DatasetRowId } from "@domain/shared"
import { Effect } from "effect"
import type { RowFieldValue } from "../entities/dataset-row.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

// Known limitation: concurrent updates to the same row are last-write-wins.
// Both callers get version N+1 and ClickHouse's argMax picks non-deterministically.
// Optimistic locking (expectedVersion) should be added if this becomes a real concern.
export function updateRow(args: {
  readonly datasetId: DatasetId
  readonly rowId: DatasetRowId
  readonly input: RowFieldValue
  readonly output: RowFieldValue
  readonly metadata: RowFieldValue
}) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
    yield* Effect.annotateCurrentSpan("rowId", args.rowId)

    const datasetRepo = yield* DatasetRepository
    const rowRepo = yield* DatasetRowRepository

    yield* rowRepo.findById({
      datasetId: args.datasetId,
      rowId: args.rowId,
    })

    const version = yield* datasetRepo.incrementVersion({
      id: args.datasetId,
      rowsUpdated: 1,
      source: "web",
    })

    yield* rowRepo
      .updateRow({
        datasetId: args.datasetId,
        rowId: args.rowId,
        version: version.version,
        input: args.input,
        output: args.output,
        metadata: args.metadata,
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
  }).pipe(Effect.withSpan("datasets.updateRow"))
}
