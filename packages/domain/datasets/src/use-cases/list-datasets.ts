import type { OrganizationId, ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { DatasetRepository } from "../ports/dataset-repository.ts"

export function listDatasets(args: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly limit?: number
  readonly offset?: number
}) {
  return Effect.gen(function* () {
    const repo = yield* DatasetRepository
    return yield* repo.listByProject(args)
  })
}
