import { Effect } from "effect"
import type { DestinationRetentionPolicyShape } from "../ports/destination-retention-policy.ts"

/** In-memory retention policy: every org reaches back `maxAgeMs`. */
export const createFakeRetentionPolicy = (maxAgeMs: number): DestinationRetentionPolicyShape => ({
  maxAgeMs: () => Effect.succeed(maxAgeMs),
})
