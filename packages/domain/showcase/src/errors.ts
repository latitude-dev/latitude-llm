import { Data } from "effect"

/**
 * The showcase is a global singleton. Creating a second one is a programming
 * error, not a recoverable state — the create use-case fails loudly with this
 * (backed defense-in-depth by the `id = 1` PK guard at the DB).
 */
export class ShowcaseAlreadyExistsError extends Data.TaggedError("ShowcaseAlreadyExistsError")<{
  readonly organizationId: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "A showcase already exists"
}
