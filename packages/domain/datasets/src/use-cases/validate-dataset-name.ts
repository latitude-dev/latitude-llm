import type { DatasetId, ProjectId } from "@domain/shared"
import { ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { DuplicateDatasetNameError } from "../errors.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"

/**
 * Validates a dataset name for a project: trims, rejects empty, rejects duplicate.
 * Returns the trimmed name on success.
 */
export function validateDatasetNameInProject(args: {
  readonly projectId: ProjectId
  readonly name: string
  readonly excludeDatasetId?: DatasetId
}) {
  return Effect.gen(function* () {
    const repo = yield* DatasetRepository
    const trimmed = args.name.trim()
    if (!trimmed) {
      return yield* new ValidationError({ field: "name", message: "Name cannot be empty" })
    }
    const exists = yield* repo.existsByNameInProject({
      projectId: args.projectId,
      name: trimmed,
      ...(args.excludeDatasetId !== undefined ? { excludeDatasetId: args.excludeDatasetId } : {}),
    })
    if (exists) {
      return yield* new DuplicateDatasetNameError({ projectId: args.projectId, name: trimmed })
    }
    return trimmed
  })
}
