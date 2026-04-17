import type { DatasetId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"

export const deleteDataset = Effect.fn("datasets.deleteDataset")(function* (args: { readonly datasetId: DatasetId }) {
  yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)

  const repo = yield* DatasetRepository
  yield* repo.findById(args.datasetId)
  yield* repo.softDelete(args.datasetId)
})
