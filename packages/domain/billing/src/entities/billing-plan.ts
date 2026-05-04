import { organizationIdSchema } from "@domain/shared"
import { z } from "zod"
import { PLAN_SLUGS } from "../constants.ts"

export const billingPlanSchema = z.object({
  slug: z.enum(PLAN_SLUGS),
  includedCredits: z.number().int().nonnegative(),
  retentionDays: z.number().int().positive(),
  overageAllowed: z.boolean(),
  hardCapped: z.boolean(),
  priceCents: z.number().int().nonnegative().nullable(),
  spendingLimitCents: z.number().int().positive().nullable(),
})

export type BillingPlan = z.infer<typeof billingPlanSchema>

export const billingOrganizationPlanSchema = z.object({
  organizationId: organizationIdSchema,
  plan: billingPlanSchema,
  source: z.enum(["override", "subscription", "free-fallback"]),
  periodStart: z.date(),
  periodEnd: z.date(),
})

export type BillingOrganizationPlan = z.infer<typeof billingOrganizationPlanSchema>
