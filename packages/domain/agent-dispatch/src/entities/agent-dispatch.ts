import { cuidSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"
import { agentDispatchTriggerSchema } from "./agent-dispatch-context.ts"

export const AGENT_DISPATCH_STATUSES = ["claimed", "dispatched", "failed"] as const
export const agentDispatchStatusSchema = z.enum(AGENT_DISPATCH_STATUSES)
export type AgentDispatchStatus = z.infer<typeof agentDispatchStatusSchema>

export const DISPATCH_ERROR_CATEGORIES = ["auth", "rate_limited", "transport", "config"] as const
export const dispatchErrorCategorySchema = z.enum(DISPATCH_ERROR_CATEGORIES)
export type DispatchErrorCategory = z.infer<typeof dispatchErrorCategorySchema>

export const agentDispatchSchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  configId: cuidSchema,
  idempotencyKey: z.string(),
  trigger: agentDispatchTriggerSchema,
  sourceType: z.enum(["signal", "monitor"]),
  sourceId: z.string(),
  claimedAt: z.date(),
  dispatchedAt: z.date().nullable(),
  externalAgentId: z.string().nullable(),
  externalRunId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  status: agentDispatchStatusSchema,
  errorCategory: dispatchErrorCategorySchema.nullable(),
  errorDetail: z.string().nullable(),
})

export type AgentDispatch = z.infer<typeof agentDispatchSchema>
