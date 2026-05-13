import { MembershipRepository } from "@domain/organizations"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { MarketingContactsPort } from "../ports/marketing-contacts.ts"

export interface MarkContactTelemetryEnabledInput {
  readonly organizationId: string
}

/**
 * Marks every member of the org as `telemetryEnabled: true` in the marketing
 * tool once the org has received its first trace. We pass both `userId` and
 * `email` so Loops can resolve the contact by email when an older record
 * (e.g. a v1-era contact) isn't yet linked to the v2 `userId`.
 */
export const markContactTelemetryEnabled = ({
  marketingContacts,
}: {
  readonly marketingContacts: MarketingContactsPort
}) =>
  Effect.fn("marketing.markContactTelemetryEnabled")(function* (input: MarkContactTelemetryEnabledInput) {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

    const membershipRepo = yield* MembershipRepository
    const members = yield* membershipRepo.listMembersWithUser(OrganizationId(input.organizationId))
    if (members.length === 0) return

    yield* Effect.forEach(
      members,
      (member) =>
        marketingContacts.updateContact({
          userId: member.userId,
          email: member.email,
          telemetryEnabled: true,
        }),
      { concurrency: "unbounded", discard: true },
    )
  })
