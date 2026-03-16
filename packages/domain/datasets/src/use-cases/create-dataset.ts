import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"

export function createDataset(args: {
  readonly projectId: ProjectId
  readonly name: string
  readonly description?: string
  readonly fileKey?: string
}) {
  return Effect.gen(function* () {
    const repo = yield* DatasetRepository
    return yield* repo.create(args)
  })
}
