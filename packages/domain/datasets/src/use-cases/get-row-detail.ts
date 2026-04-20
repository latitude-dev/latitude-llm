import type { DatasetId, DatasetRowId, DatasetVersionId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

export const getRowDetail = Effect.fn("datasets.getRowDetail")(function* (args: {
  readonly datasetId: DatasetId
  readonly rowId: DatasetRowId
  readonly versionId?: DatasetVersionId
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)
  yield* Effect.annotateCurrentSpan("rowId", args.rowId)

  const rowRepo = yield* DatasetRowRepository

  let version: number | undefined
  if (args.versionId) {
    const datasetRepo = yield* DatasetRepository
    version = yield* datasetRepo.resolveVersion({
      datasetId: args.datasetId,
      versionId: args.versionId,
    })
  }

  return yield* rowRepo.findById({
    datasetId: args.datasetId,
    rowId: args.rowId,
    ...(version !== undefined ? { version } : {}),
  })
})
