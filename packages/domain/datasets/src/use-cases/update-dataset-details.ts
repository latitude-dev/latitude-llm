import type { DatasetId } from "@domain/shared"
import { ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { validateDatasetNameInProject } from "./validate-dataset-name.ts"

function normalizeDescription(description: string | null | undefined): string | null {
  if (description === null || description === undefined) return null
  const t = description.trim()
  return t === "" ? null : t
}

export function updateDatasetDetails(args: {
  readonly datasetId: DatasetId
  readonly name: string
  readonly description: string | null | undefined
}) {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("datasetId", args.datasetId)

    const repo = yield* DatasetRepository
    const dataset = yield* repo.findById(args.datasetId)
    const trimmedName = args.name.trim()
    if (trimmedName === "") {
      return yield* new ValidationError({ field: "name", message: "Name cannot be empty" })
    }
    const normalizedDesc = normalizeDescription(args.description)

    if (dataset.name === trimmedName && dataset.description === normalizedDesc) {
      return dataset
    }

    const name = yield* validateDatasetNameInProject({
      projectId: dataset.projectId,
      name: args.name,
      excludeDatasetId: args.datasetId,
    })

    return yield* repo.updateDetails({
      id: args.datasetId,
      name,
      description: normalizedDesc,
    })
  }).pipe(Effect.withSpan("datasets.updateDatasetDetails"))
}
