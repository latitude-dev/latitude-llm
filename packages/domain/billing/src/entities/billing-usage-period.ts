import { organizationIdSchema } from "@domain/shared"
import { z } from "zod"
import { PLAN_SLUGS } from "../constants.ts"

export const billingUsagePeriodSchema = z.object({
  organizationId: organizationIdSchema,
  planSlug: z.enum(PLAN_SLUGS),
  periodStart: z.date(),
  periodEnd: z.date(),
  includedCredits: z.number().int().nonnegative(),
  consumedCredits: z.number().int().nonnegative().default(0),
  overageCredits: z.number().int().nonnegative().default(0),
  reportedOverageCredits: z.number().int().nonnegative().default(0),
  overageAmountMicrocents: z.number().int().nonnegative().default(0),
  updatedAt: z.date(),
})

export type BillingUsagePeriod = z.infer<typeof billingUsagePeriodSchema>
