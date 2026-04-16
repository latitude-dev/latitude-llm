import type { DatasetId, DatasetRowId } from "@domain/shared"
import { Effect } from "effect"
import type { InsertRowFieldValue } from "../entities/dataset-row.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"
import { buildValidRowId } from "../validate-row-id.ts"

export function insertRows(args: {
  readonly datasetId: DatasetId
  readonly rows: readonly {
    readonly id?: DatasetRowId
    readonly input: InsertRowFieldValue
    readonly output?: InsertRowFieldValue
    readonly metadata?: InsertRowFieldValue
  }[]
  readonly source?: string
}) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)

    const resolvedRows = yield* Effect.forEach(args.rows, (row) =>
      buildValidRowId(row.id).pipe(Effect.map((id) => ({ ...row, id }))),
    )

    const datasetRepo = yield* DatasetRepository
    const rowRepo = yield* DatasetRowRepository

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
  }).pipe(Effect.withSpan("datasets.insertRows"))
}
