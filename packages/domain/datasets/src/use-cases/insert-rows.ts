import type { DatasetId, DatasetRowId, OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"
import { buildValidRowId } from "../validate-row-id.ts"

export function insertRows(args: {
  readonly organizationId: OrganizationId
  readonly datasetId: DatasetId
  readonly rows: readonly {
    readonly id?: DatasetRowId
    readonly input: Record<string, unknown>
    readonly output?: Record<string, unknown>
    readonly metadata?: Record<string, unknown>
  }[]
  readonly source?: string
}) {
  return Effect.gen(function* () {
    const resolvedRows = yield* Effect.forEach(args.rows, (row) =>
      buildValidRowId(row.id).pipe(Effect.map((id) => ({ ...row, id }))),
    )

    const datasetRepo = yield* DatasetRepository
    const rowRepo = yield* DatasetRowRepository

    const version = yield* datasetRepo.incrementVersion({
      organizationId: args.organizationId,
      id: args.datasetId,
      rowsInserted: resolvedRows.length,
      source: args.source ?? "api",
    })

    const rowIds = yield* rowRepo
      .insertBatch({
        organizationId: args.organizationId,
        datasetId: args.datasetId,
        version: version.version,
        rows: resolvedRows,
      })
      .pipe(
        Effect.tapError(() =>
          datasetRepo.decrementVersion({
            organizationId: args.organizationId,
            id: args.datasetId,
            versionId: version.id,
          }),
        ),
      )

    return { versionId: version.id, version: version.version, rowIds }
  })
}
