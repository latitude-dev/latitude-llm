import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

interface DismissShowcaseInput {
  readonly actorUserId: string
}

/**
 * Flip the requesting org's `wantsShowcase` flag to `false` — the user-facing
 * "Remove demo" action. It targets the viewer's OWN org (the session org from
 * `SqlClient`), never the shared showcase org, and is org-wide: any member can
 * dismiss it for the whole team. Afterwards the showcase resolver stops
 * authorizing this org (so `/projects/lat-demo` 404s) and the client-collection
 * merge drops the switcher row.
 *
 * Idempotent: re-running on an already-dismissed org is a harmless no-op save.
 */
export const dismissShowcaseUseCase = Effect.fn("organizations.dismissShowcase")(function* (
  input: DismissShowcaseInput,
) {
  const sqlClient = yield* SqlClient
  const repo = yield* OrganizationRepository

  yield* Effect.annotateCurrentSpan("actor.userId", input.actorUserId)

  const org = yield* repo.findById(sqlClient.organizationId)

  const updated: Organization = {
    ...org,
    settings: { ...org.settings, wantsShowcase: false },
    updatedAt: new Date(),
  }

  yield* repo.save(updated)

  return updated
})
