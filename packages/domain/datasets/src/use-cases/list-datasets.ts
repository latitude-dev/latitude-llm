import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import type { DatasetListOptions } from "../ports/dataset-repository.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"

export function listDatasets(args: { readonly projectId: ProjectId; readonly options?: DatasetListOptions }) {
  return Effect.gen(function* () {
    const repo = yield* DatasetRepository
    return yield* repo.listByProject(
      args.options !== undefined ? { projectId: args.projectId, options: args.options } : { projectId: args.projectId },
    )
  })
}
