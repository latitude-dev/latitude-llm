import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface UpdateOrganizationNameInput {
  readonly organizationId: OrganizationId
  readonly name: string
}

export const updateOrganizationNameUseCase = (input: UpdateOrganizationNameInput) =>
  Effect.gen(function* () {
    const repo = yield* OrganizationRepository
    const existing = yield* repo.findById(input.organizationId)
    const updated = { ...existing, name: input.name, updatedAt: new Date() }
    yield* repo.save(updated)
    return updated
  })
