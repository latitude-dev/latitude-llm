import { cuidSchema, organizationIdSchema } from "@domain/shared"
import { z } from "zod"
import { GITHUB_DELIVERY_STATUSES } from "../constants.ts"

export const githubDeliveryStatusSchema = z.enum(GITHUB_DELIVERY_STATUSES)
export type GithubDeliveryStatus = z.infer<typeof githubDeliveryStatusSchema>

/**
 * The idempotency claim + audit/debug ledger, one row per webhook delivery.
 * Merged-PR rows additionally carry the push↔PR attribution join keys
 * (`prNumber`/`mergeCommitSha`/`headSha`) so there is no separate merges
 * table (5.9). `truncated` records when a push's `commits[]` hit the cap and
 * the API walk did not cover it — no silent caps (5.7). `status` is null while
 * a delivery is claimed but not yet finalized (a crash mid-processing leaves it
 * null so a retry can re-claim it).
 */
export const githubDeliverySchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  integrationId: cuidSchema,
  deliveryId: z.string().min(1),
  event: z.string().min(1),
  action: z.string().nullable(),
  repoId: z.number().int().positive().nullable(),
  status: githubDeliveryStatusSchema.nullable(),
  skipReason: z.string().nullable(),
  errorCategory: z.string().nullable(),
  errorDetail: z.string().nullable(),
  truncated: z.boolean(),
  prNumber: z.number().int().nullable(),
  mergeCommitSha: z.string().nullable(),
  headSha: z.string().nullable(),
  receivedAt: z.date(),
  processedAt: z.date().nullable(),
})

export type GithubDelivery = z.infer<typeof githubDeliverySchema>
