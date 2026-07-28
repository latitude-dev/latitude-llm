import type { OrganizationSettings } from "@domain/shared"
import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface UpdateOrganizationInput {
  readonly name?: string | undefined
  /** Replaces `settings` wholesale, which is how a caller clears a key. */
  readonly settings?: OrganizationSettings | undefined
  /** Shallow-merged over the stored settings, so keys the caller doesn't know about survive. */
  readonly settingsPatch?: OrganizationSettings | undefined
}

export const updateOrganizationUseCase = Effect.fn("organizations.updateOrganization")(function* (
  input: UpdateOrganizationInput,
) {
  const sqlClient = yield* SqlClient
  const repo = yield* OrganizationRepository

  const org = yield* repo.findById(sqlClient.organizationId)

  const nextSettings =
    input.settingsPatch !== undefined ? { ...(org.settings ?? {}), ...input.settingsPatch } : input.settings

  const updated: Organization = {
    ...org,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(nextSettings !== undefined ? { settings: nextSettings } : {}),
    updatedAt: new Date(),
  }

  yield* repo.save(updated)

  return updated
})
