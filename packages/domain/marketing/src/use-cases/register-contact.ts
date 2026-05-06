import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import { MARKETING_SOURCE_V2_SIGNUP } from "../constants.ts"
import type { MarketingContactsPort } from "../ports/marketing-contacts.ts"

export interface RegisterContactInput {
  readonly userId: string
}

/**
 * Creates the marketing contact for a freshly-signed-up user.
 *
 * The user row may have been deleted between event publish and consumption
 * (worker retries crossing a delete) — in that case we no-op rather than
 * failing the queue task; the contact never has to exist.
 */
export const registerContact = ({ marketingContacts }: { readonly marketingContacts: MarketingContactsPort }) =>
  Effect.fn("marketing.registerContact")(function* (input: RegisterContactInput) {
    yield* Effect.annotateCurrentSpan("userId", input.userId)

    const userRepo = yield* UserRepository
    const user = yield* userRepo
      .findById(input.userId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (!user) return

    yield* marketingContacts.createContact({
      email: user.email,
      userId: user.id,
      firstName: user.name,
      source: MARKETING_SOURCE_V2_SIGNUP,
      createdAt: user.createdAt,
      subscribed: true,
    })
  })
