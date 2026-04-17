import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { DatasetListOptions } from "../ports/dataset-repository.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"

export const listDatasets = Effect.fn("datasets.listDatasets")(function* (args: {
  readonly projectId: ProjectId
  readonly options?: DatasetListOptions
}) {
  yield* Effect.annotateCurrentSpan("projectId", args.projectId)

  const repo = yield* DatasetRepository
  return yield* repo.listByProject(
    args.options !== undefined ? { projectId: args.projectId, options: args.options } : { projectId: args.projectId },
  )
})
