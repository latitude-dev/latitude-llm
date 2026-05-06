import { MembershipRepository } from "@domain/organizations"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { MarketingContactsPort } from "../ports/marketing-contacts.ts"

export interface MarkContactTelemetryEnabledInput {
  readonly organizationId: string
}

/**
 * Marks every member of the org as `telemetryEnabled: true` in the marketing
 * tool once the org has received its first trace. Every current member is
 * already a Loops contact (they either signed up or were registered after
 * accepting an invite), so we update each by `userId`.
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
          telemetryEnabled: true,
        }),
      { concurrency: "unbounded", discard: true },
    )
  })
