import { organizationIdSchema } from "@domain/shared"
import { z } from "zod"
import { PLAN_SLUGS } from "../constants.ts"

export const billingOverrideSchema = z.object({
  id: z.string().min(1),
  organizationId: organizationIdSchema,
  plan: z.enum(PLAN_SLUGS),
  includedCredits: z.number().int().nonnegative().nullable(),
  retentionDays: z.number().int().positive().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type BillingOverride = z.infer<typeof billingOverrideSchema>
