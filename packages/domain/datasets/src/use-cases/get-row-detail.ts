import type { DatasetId, DatasetRowId, DatasetVersionId, OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { DatasetRowRepository } from "../ports/dataset-row-repository.ts"

export function getRowDetail(args: {
  readonly organizationId: OrganizationId
  readonly datasetId: DatasetId
  readonly rowId: DatasetRowId
  readonly versionId?: DatasetVersionId
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

    return yield* rowRepo.findById({
      organizationId: args.organizationId,
      datasetId: args.datasetId,
      rowId: args.rowId,
      ...(version !== undefined ? { version } : {}),
    })
  })
}
