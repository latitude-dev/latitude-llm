import type { Effect } from "effect"
import { z } from "zod"
import { MARKETING_USER_GROUP_CODE_AGENTS, MARKETING_USER_GROUP_PROD_TRACES } from "../constants.ts"
import type { MarketingContactsError } from "../errors.ts"

export const marketingUserGroupSchema = z.enum([MARKETING_USER_GROUP_CODE_AGENTS, MARKETING_USER_GROUP_PROD_TRACES])

export const marketingCreateContactInputSchema = z.object({
  email: z.email(),
  userId: z.string().min(1),
  firstName: z.string().nullish(),
  source: z.string().optional(),
  createdAt: z.date().optional(),
  subscribed: z.boolean().optional(),
})

export const marketingUpdateContactInputSchema = z.object({
  userId: z.string().min(1),
  email: z.email().optional(),
  firstName: z.string().nullish(),
  jobTitle: z.string().nullish(),
  userGroup: marketingUserGroupSchema.optional(),
  telemetryEnabled: z.boolean().optional(),
})

export type MarketingCreateContactInput = z.infer<typeof marketingCreateContactInputSchema>
export type MarketingUpdateContactInput = z.infer<typeof marketingUpdateContactInputSchema>

/**
 * Outbound port for marketing-tool contact lifecycle.
 *
 * Implementations live in `@platform/<vendor>` (currently `@platform/loops`).
 * `createContact` is idempotent on the adapter side: a duplicate-email
 * response is swallowed so re-deliveries of `UserSignedUp` (or v1 -> v2
 * re-signups) do not fail the queue task. `updateContact` is naturally
 * idempotent and only sends fields that are explicitly provided.
 */
export interface MarketingContactsPort {
  readonly createContact: (input: MarketingCreateContactInput) => Effect.Effect<void, MarketingContactsError>
  readonly updateContact: (input: MarketingUpdateContactInput) => Effect.Effect<void, MarketingContactsError>
}
