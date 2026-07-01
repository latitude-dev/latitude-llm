import { cuidSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"
import { AGENT_DISPATCH_KINDS, AGENT_DISPATCH_TRIGGERS } from "../constants.ts"

export const agentDispatchKindSchema = z.enum(AGENT_DISPATCH_KINDS)
export type AgentDispatchKind = z.infer<typeof agentDispatchKindSchema>

export const agentDispatchGuardrailsSchema = z.object({
  maxDispatchesPerDay: z.number().int().positive(),
  cooldownMinutes: z.number().int().nonnegative(),
})

export type AgentDispatchGuardrails = z.infer<typeof agentDispatchGuardrailsSchema>

export const cursorDispatchTargetSchema = z.object({
  repoUrl: z.string().url(),
  startingRef: z.string().optional(),
  autoCreatePR: z.boolean().optional(),
})

export const claudeDispatchTargetSchema = z.object({
  routineTriggerId: z.string().min(1),
})

export const linearDispatchTargetSchema = z.object({
  teamId: z.string().min(1),
  labelIds: z.array(z.string()).optional(),
  assigneeId: z.string().optional(),
})

export const webhookDispatchTargetSchema = z.object({
  webhookUrl: z.string().url().startsWith("https://", "Webhook URL must use HTTPS"),
})

export const agentDispatchTargetSchema = z.union([
  cursorDispatchTargetSchema,
  claudeDispatchTargetSchema,
  linearDispatchTargetSchema,
  webhookDispatchTargetSchema,
])

export type AgentDispatchTarget = z.infer<typeof agentDispatchTargetSchema>

export const agentDispatchConfigSchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  integrationId: cuidSchema,
  kind: agentDispatchKindSchema,
  enabled: z.boolean(),
  triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)),
  target: agentDispatchTargetSchema,
  promptTemplate: z.string().nullable(),
  guardrails: agentDispatchGuardrailsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AgentDispatchConfig = z.infer<typeof agentDispatchConfigSchema>

export type ResolvedDispatchTarget = AgentDispatchTarget & { readonly kind: AgentDispatchKind }
