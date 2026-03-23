import type { DatasetId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { validateDatasetNameInProject } from "./validate-dataset-name.ts"

export function createDataset(args: {
  readonly id?: DatasetId
  readonly projectId: ProjectId
  readonly name: string
  readonly description?: string
  readonly fileKey?: string
}) {
  return Effect.gen(function* () {
    const repo = yield* DatasetRepository
    const name = yield* validateDatasetNameInProject({
      projectId: args.projectId,
      name: args.name,
    })
    return yield* repo.create({ ...args, name })
  })
}
