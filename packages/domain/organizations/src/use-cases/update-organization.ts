import type { OrganizationSettings } from "@domain/shared"
import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface UpdateOrganizationInput {
  readonly name?: string | undefined
  readonly settings?: OrganizationSettings | undefined
}

export const updateOrganizationUseCase = (input: UpdateOrganizationInput) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    const repo = yield* OrganizationRepository

    const org = yield* repo.findById(sqlClient.organizationId)

    const updated: Organization = {
      ...org,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.settings !== undefined ? { settings: input.settings } : {}),
      updatedAt: new Date(),
    }

    yield* repo.save(updated)

    return updated
  }).pipe(Effect.withSpan("organizations.updateOrganization"))
