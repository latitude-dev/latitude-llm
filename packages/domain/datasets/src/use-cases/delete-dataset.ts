import type { DatasetId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"

export function deleteDataset(args: { readonly datasetId: DatasetId }) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)

    const repo = yield* DatasetRepository
    yield* repo.findById(args.datasetId)
    yield* repo.softDelete(args.datasetId)
  }).pipe(Effect.withSpan("datasets.deleteDataset"))
}
