import type { OrganizationId, ProjectId } from "@domain/shared"
import { cuidSchema, organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"
import { AGENT_DISPATCH_KINDS, AGENT_DISPATCH_TRIGGERS } from "../constants.ts"
import type { AgentDispatchTrigger } from "./agent-dispatch-context.ts"

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

export const storedCursorDispatchTargetSchema = cursorDispatchTargetSchema.partial({ repoUrl: true })

// storedCursorDispatchTargetSchema has every field optional, so it matches `{}` and
// any object — it MUST stay last, and no other all-optional kind may precede it, or
// zod's union would match cursor first and mis-parse. e.g. a `{ teamId }` linear target
// placed after cursor would resolve as an empty cursor target instead.
export const storedAgentDispatchTargetSchema = z.union([
  claudeDispatchTargetSchema,
  linearDispatchTargetSchema,
  webhookDispatchTargetSchema,
  storedCursorDispatchTargetSchema,
])

export type StoredAgentDispatchTarget = z.infer<typeof storedAgentDispatchTargetSchema>

/**
 * A stored config row. `projectId === null` marks the org-wide default for the
 * integration; rows with a project are per-project overrides where each
 * nullable field means "inherit from the default" and a non-null field
 * replaces the default's value wholly. `promptTemplate` cannot distinguish
 * "inherit" from "clear" — an empty string is the escape hatch to disable a
 * default template.
 */
export const agentDispatchConfigRowSchema = z.object({
  id: cuidSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema.nullable(),
  integrationId: cuidSchema,
  kind: agentDispatchKindSchema,
  enabled: z.boolean().nullable(),
  triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)).nullable(),
  target: storedAgentDispatchTargetSchema.nullable(),
  promptTemplate: z.string().nullable(),
  guardrails: agentDispatchGuardrailsSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AgentDispatchConfigRow = z.infer<typeof agentDispatchConfigRowSchema>

/** A default and its project override merged for one resolving project. */
export interface EffectiveAgentDispatchConfig {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly enabled: boolean
  readonly triggers: readonly AgentDispatchTrigger[]
  readonly target: StoredAgentDispatchTarget | null
  readonly promptTemplate: string | null
  readonly guardrails: AgentDispatchGuardrails
}

export type ResolvedDispatchTarget = AgentDispatchTarget & { readonly kind: AgentDispatchKind }
