import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { AdminOrganizationRepository } from "./organization-repository.ts"

export interface ResetSystemMonitorsInput {
  readonly organizationId: OrganizationId
}

export interface ResetSystemMonitorsResult {
  readonly projectsCount: number
  readonly monitorsReset: number
}

export const resetSystemMonitorsUseCase = Effect.fn("admin.resetSystemMonitors")(function* (
  input: ResetSystemMonitorsInput,
) {
  yield* Effect.annotateCurrentSpan("admin.targetOrganizationId", input.organizationId)

  const adminRepo = yield* AdminOrganizationRepository
  const org = yield* adminRepo.findById(input.organizationId)

  return { projectsCount: org.projects.length, monitorsReset: 0 } satisfies ResetSystemMonitorsResult
})
