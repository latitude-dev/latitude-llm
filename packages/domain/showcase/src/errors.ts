import { Data } from "effect"
import type { ShowcaseNextState } from "./entities/showcase.ts"

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

/**
 * The pointer row is missing. Regeneration/swap presuppose the showcase was
 * bootstrapped (S1 create use-case); hitting this means the cron/backoffice ran
 * before a showcase exists.
 */
export class ShowcaseNotFoundError extends Data.TaggedError("ShowcaseNotFoundError")<Record<never, never>> {
  readonly httpStatus = 404
  readonly httpMessage = "No showcase exists"
}

/**
 * The swap was attempted while `next` isn't `ready` (no build in flight, or a
 * build still `building`). The transactional swap asserts `next_state = 'ready'`
 * under a row lock, so this is also the serialization guard: only the first of
 * two racing swaps consumes the `ready` state; the second sees `idle` and fails
 * here rather than double-flipping the pointer.
 */
export class ShowcaseNotReadyError extends Data.TaggedError("ShowcaseNotReadyError")<{
  readonly nextState: ShowcaseNextState | null
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Showcase next build is not ready to swap"
}
