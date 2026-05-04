import { organizationIdSchema, projectIdSchema, traceIdSchema } from "@domain/shared"
import { z } from "zod"
import { CHARGEABLE_ACTIONS } from "../constants.ts"

export const billingUsageEventSchema = z.object({
  id: z.string().min(1),
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  action: z.enum(CHARGEABLE_ACTIONS),
  credits: z.number().int().positive(),
  idempotencyKey: z.string().min(1),
  traceId: traceIdSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  happenedAt: z.date(),
  billingPeriodStart: z.date(),
  billingPeriodEnd: z.date(),
})

export type BillingUsageEvent = z.infer<typeof billingUsageEventSchema>
