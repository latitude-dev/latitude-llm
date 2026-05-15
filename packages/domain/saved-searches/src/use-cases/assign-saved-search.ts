import { MembershipRepository } from "@domain/organizations"
import type { OrganizationId, SavedSearchId, UserId } from "@domain/shared"
import { Effect } from "effect"
import { AssigneeNotOrgMemberError } from "../errors.ts"
import { updateSavedSearch } from "./update-saved-search.ts"

export interface AssignSavedSearchInput {
  readonly organizationId: OrganizationId
  readonly savedSearchId: SavedSearchId
  /** `null` clears the current assignment. */
  readonly assigneeUserId: UserId | null
}

/**
 * Assigns (or unassigns when `assigneeUserId` is `null`) a saved search to a
 * user. When assigning, validates that the user is a confirmed member of
 * `organizationId` and fails with {@link AssigneeNotOrgMemberError} otherwise.
 */
export const assignSavedSearchUseCase = Effect.fn("savedSearches.assignSavedSearch")(function* (
  input: AssignSavedSearchInput,
) {
  yield* Effect.annotateCurrentSpan("savedSearchId", input.savedSearchId)
  yield* Effect.annotateCurrentSpan("assigneeUserId", input.assigneeUserId ?? "null")

  if (input.assigneeUserId !== null) {
    const membershipRepo = yield* MembershipRepository
    const isMember = yield* membershipRepo.isMember(input.organizationId, input.assigneeUserId)
    if (!isMember) {
      return yield* new AssigneeNotOrgMemberError({ userId: input.assigneeUserId as string })
    }
  }

  return yield* updateSavedSearch({ id: input.savedSearchId, assignedUserId: input.assigneeUserId })
})
