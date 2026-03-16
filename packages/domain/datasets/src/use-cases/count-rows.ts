import type { DatasetId, DatasetVersionId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

export function countRows(args: {
  readonly datasetId: DatasetId
  readonly versionId?: DatasetVersionId
  readonly search?: string
}) {
  return Effect.gen(function* () {
    const rowRepo = yield* DatasetRowRepository

    let version: number | undefined
    if (args.versionId) {
      const datasetRepo = yield* DatasetRepository
      version = yield* datasetRepo.resolveVersion({
        datasetId: args.datasetId,
        versionId: args.versionId,
      })
    }

    return yield* rowRepo.count({
      datasetId: args.datasetId,
      ...(version !== undefined ? { version } : {}),
      ...(args.search ? { search: args.search } : {}),
    })
  })
}
