import { type DatasetId, type DatasetRowId, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { writableColumns } from "../columns.ts"
import type { InsertRowFieldValue } from "../entities/dataset-row.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"
import { buildValidRowId } from "../validate-row-id.ts"

export const insertRows = Effect.fn("datasets.insertRows")(function* (args: {
  readonly datasetId: DatasetId
  readonly rows: readonly {
    readonly id?: DatasetRowId
    readonly input: InsertRowFieldValue
    readonly output?: InsertRowFieldValue
    readonly expectedOutput?: InsertRowFieldValue
    readonly metadata?: InsertRowFieldValue
    readonly custom?: Record<string, InsertRowFieldValue>
  }[]
  readonly source?: string
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)

  const resolvedRows = yield* Effect.forEach(args.rows, (row) =>
    buildValidRowId(row.id).pipe(Effect.map((id) => ({ ...row, id }))),
  )

  const datasetRepo = yield* DatasetRepository
  const rowRepo = yield* DatasetRowRepository

  const dataset = yield* datasetRepo.findById(args.datasetId)
  const { writableCustomIds } = writableColumns(dataset.columns)
  for (const row of resolvedRows) {
    for (const key of Object.keys(row.custom ?? {})) {
      if (!writableCustomIds.has(key)) {
        return yield* new ValidationError({
          field: "custom",
          message: `Unknown or removed column "${key}"`,
        })
      }
    }
  }

  const version = yield* datasetRepo.incrementVersion({
    id: args.datasetId,
    rowsInserted: resolvedRows.length,
    source: args.source ?? "api",
  })

  const rowIds = yield* rowRepo
    .insertBatch({
      datasetId: args.datasetId,
      version: version.version,
      rows: resolvedRows,
    })
    .pipe(
      Effect.tapError(() =>
        datasetRepo.decrementVersion({
          id: args.datasetId,
          versionId: version.id,
        }),
      ),
    )

  return { versionId: version.id, version: version.version, rowIds }
})
