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

/**
 * `redaction` is writable only through `updateOrganizationRedactionUseCase`, which gates on
 * role and records an audit event. This endpoint has neither, so it pins the stored value
 * whatever the caller sent.
 */
const withStoredRedaction = (
  stored: OrganizationSettings | null | undefined,
  next: OrganizationSettings | undefined,
): OrganizationSettings | undefined => {
  if (next === undefined) return undefined
  const storedRedaction = stored?.redaction
  const { redaction: _ignored, ...withoutRedaction } = next
  return storedRedaction === undefined ? withoutRedaction : { ...withoutRedaction, redaction: storedRedaction }
}

export const updateOrganizationUseCase = Effect.fn("organizations.updateOrganization")(function* (
  input: UpdateOrganizationInput,
) {
  const sqlClient = yield* SqlClient
  const repo = yield* OrganizationRepository

  const org = yield* repo.findById(sqlClient.organizationId)

  const nextSettings = withStoredRedaction(
    org.settings,
    input.settingsPatch !== undefined ? { ...(org.settings ?? {}), ...input.settingsPatch } : input.settings,
  )

  const updated: Organization = {
    ...org,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(nextSettings !== undefined ? { settings: nextSettings } : {}),
    updatedAt: new Date(),
  }

  yield* repo.save(updated)

  return updated
})
