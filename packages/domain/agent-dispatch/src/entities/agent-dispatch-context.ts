import { z } from "zod"
import { AGENT_DISPATCH_TRIGGERS } from "../constants.ts"

export const agentDispatchTriggerSchema = z.enum(AGENT_DISPATCH_TRIGGERS)
export type AgentDispatchTrigger = z.infer<typeof agentDispatchTriggerSchema>

export const agentDispatchContextSchema = z.object({
  trigger: agentDispatchTriggerSchema,
  organizationName: z.string(),
  projectName: z.string(),
  projectSlug: z.string(),
  signal: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      source: z.enum(["flagger", "annotation", "custom"]),
      priority: z.string().nullable(),
    })
    .optional(),
  incident: z
    .object({
      id: z.string(),
      severity: z.string(),
    })
    .optional(),
  metrics: z
    .object({
      occurrences: z.number(),
      windowHours: z.number(),
      baselinePerHour: z.number().nullable(),
    })
    .optional(),
  sampleExcerpt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  deepLinkUrl: z.string(),
  sampleTraceIds: z.array(z.string()).optional(),
})

export type AgentDispatchContext = z.infer<typeof agentDispatchContextSchema>
