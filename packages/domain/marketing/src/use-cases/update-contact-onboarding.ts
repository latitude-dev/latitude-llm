import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import { type StackChoice, stackChoiceToOnboardingType } from "../constants.ts"
import type { MarketingContactsPort } from "../ports/marketing-contacts.ts"

export interface UpdateContactOnboardingInput {
  readonly userId: string
  readonly stackChoice: StackChoice
}

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
      email: user.email,
      firstName: user.name,
      jobTitle: user.jobTitle,
      phoneNumber: user.phoneNumber,
      userGroup: stackChoiceToOnboardingType(input.stackChoice),
    })
  })
