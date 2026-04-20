import type { DatasetId, DatasetRowId, DatasetVersionId, SortDirection } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

export const listRows = Effect.fn("datasets.listRows")(function* (args: {
  readonly datasetId: DatasetId
  readonly versionId?: DatasetVersionId
  readonly search?: string
  readonly sortDirection?: SortDirection
  readonly limit?: number
  readonly offset?: number
  readonly cursor?: { readonly createdAt: string; readonly rowId: DatasetRowId }
}) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)

  const rowRepo = yield* DatasetRowRepository

  let version: number | undefined
  if (args.versionId) {
    const datasetRepo = yield* DatasetRepository
    version = yield* datasetRepo.resolveVersion({
      datasetId: args.datasetId,
      versionId: args.versionId,
    })
  }

  return yield* rowRepo.list({
    datasetId: args.datasetId,
    ...(version !== undefined ? { version } : {}),
    ...(args.search ? { search: args.search } : {}),
    ...(args.sortDirection !== undefined ? { sortDirection: args.sortDirection } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    ...(args.offset !== undefined ? { offset: args.offset } : {}),
    ...(args.cursor ? { cursor: args.cursor } : {}),
  })
})
