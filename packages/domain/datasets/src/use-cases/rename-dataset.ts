import type { DatasetId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { validateDatasetNameInProject } from "./validate-dataset-name.ts"

export function renameDataset(args: { readonly datasetId: DatasetId; readonly name: string }) {
  return Effect.gen(function* () {
    const repo = yield* DatasetRepository
    const dataset = yield* repo.findById(args.datasetId)
    const trimmed = args.name.trim()
    if (dataset.name === trimmed) return dataset

    const name = yield* validateDatasetNameInProject({
      projectId: dataset.projectId,
      name: args.name,
      excludeDatasetId: args.datasetId,
    })

    return yield* repo.updateName({ id: args.datasetId, name })
  })
}
