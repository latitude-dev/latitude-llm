import { type DatasetId, type DatasetRowId, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { writableColumns } from "../columns.ts"
import type { InsertRowFieldValue } from "../entities/dataset-row.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

// Known limitation: concurrent updates to the same row are last-write-wins.
// Both callers get version N+1 and ClickHouse's argMax picks non-deterministically.
// Optimistic locking (expectedVersion) should be added if this becomes a real concern.
export const updateRow = Effect.fn("datasets.updateRow")(function* (args: {
  readonly datasetId: DatasetId
  readonly rowId: DatasetRowId
  readonly input?: InsertRowFieldValue
  readonly output?: InsertRowFieldValue
  readonly expectedOutput?: InsertRowFieldValue
  readonly metadata?: InsertRowFieldValue
  readonly custom?: Record<string, InsertRowFieldValue>
  readonly source?: string
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  yield* Effect.annotateCurrentSpan("rowId", args.rowId)

  const datasetRepo = yield* DatasetRepository
  const rowRepo = yield* DatasetRowRepository

  const existing = yield* rowRepo.findById({
    datasetId: args.datasetId,
    rowId: args.rowId,
  })

  const dataset = yield* datasetRepo.findById(args.datasetId)
  const { writableCustomIds } = writableColumns(dataset.columns)
  const provided = args.custom ?? {}
  for (const key of Object.keys(provided)) {
    if (!writableCustomIds.has(key)) {
      return yield* new ValidationError({ field: "custom", message: `Unknown or removed column "${key}"` })
    }
  }
  // Merge onto the stored custom blob (which CH replaces wholesale) so hidden custom values survive an edit.
  const custom = { ...existing.custom, ...provided }

  const version = yield* datasetRepo.incrementVersion({
    id: args.datasetId,
    rowsUpdated: 1,
    source: args.source ?? "web",
  })

  yield* rowRepo
    .updateRow({
      datasetId: args.datasetId,
      rowId: args.rowId,
      version: version.version,
      input: args.input !== undefined ? args.input : existing.input,
      output: args.output !== undefined ? args.output : existing.output,
      expectedOutput: args.expectedOutput !== undefined ? args.expectedOutput : existing.expectedOutput,
      metadata: args.metadata !== undefined ? args.metadata : existing.metadata,
      custom,
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
