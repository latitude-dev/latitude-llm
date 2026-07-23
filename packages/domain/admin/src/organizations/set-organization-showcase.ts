import type { NotFoundError, OrganizationId, RepositoryError, UserId } from "@domain/shared"
import { Effect } from "effect"
import { AdminOrganizationRepository } from "./organization-repository.ts"

export interface SetOrganizationShowcaseInput {
  readonly organizationId: OrganizationId
  /** `true` enables the Showcase demo for the org, `false` dismisses it. */
  readonly enabled: boolean
  /** Platform admin who initiated the action (audit context). */
  readonly actorAdminUserId: UserId
}

export type SetOrganizationShowcaseError = NotFoundError | RepositoryError

/**
 * Backoffice toggle for an org's `wantsShowcase` flag. This is the staff
 * counterpart to the user-facing "Remove demo" dismiss: it re-enables the
 * shared read-only Showcase for an org that dismissed it, or enables it on an
 * older org created before the feature existed. Gates the switcher entry and
 * route access via the showcase resolver; enabling only surfaces the demo once
 * a showcase has actually been built.
 */
export const setOrganizationShowcaseUseCase = Effect.fn("admin.setOrganizationShowcase")(function* (
  input: SetOrganizationShowcaseInput,
) {
  yield* Effect.annotateCurrentSpan("admin.targetOrganizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("admin.showcaseEnabled", input.enabled)

  const repo = yield* AdminOrganizationRepository
  yield* repo.setWantsShowcase(input.organizationId, input.enabled)
}) satisfies (
  input: SetOrganizationShowcaseInput,
) => Effect.Effect<void, SetOrganizationShowcaseError, AdminOrganizationRepository>
