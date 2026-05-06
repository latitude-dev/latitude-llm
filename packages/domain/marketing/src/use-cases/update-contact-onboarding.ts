import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import {
  MARKETING_USER_GROUP_CODE_AGENTS,
  MARKETING_USER_GROUP_PROD_TRACES,
  type MarketingUserGroup,
} from "../constants.ts"
import type { MarketingContactsPort } from "../ports/marketing-contacts.ts"

export interface UpdateContactOnboardingInput {
  readonly userId: string
  readonly stackChoice: "coding-agent-machine" | "production-agent"
}

const stackChoiceToUserGroup = (stackChoice: UpdateContactOnboardingInput["stackChoice"]): MarketingUserGroup =>
  stackChoice === "coding-agent-machine" ? MARKETING_USER_GROUP_CODE_AGENTS : MARKETING_USER_GROUP_PROD_TRACES

/**
 * Updates the marketing contact with onboarding-form fields (jobTitle,
 * userGroup) once the user finishes the project-onboarding step. `firstName`
 * is included as well so magic-link signups (no name at signup) get their
 * name on the contact at this point.
 */
export const updateContactOnboarding = ({ marketingContacts }: { readonly marketingContacts: MarketingContactsPort }) =>
  Effect.fn("marketing.updateContactOnboarding")(function* (input: UpdateContactOnboardingInput) {
    yield* Effect.annotateCurrentSpan("userId", input.userId)

    const userRepo = yield* UserRepository
    const user = yield* userRepo
      .findById(input.userId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!user) return

    yield* marketingContacts.updateContact({
      userId: input.userId,
      firstName: user.name,
      jobTitle: user.jobTitle,
      userGroup: stackChoiceToUserGroup(input.stackChoice),
    })
  })
