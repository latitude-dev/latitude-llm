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
      source: z.enum(["flagger", "annotation", "custom", "cost"]),
      priority: z.string().nullable(),
    })
    .optional(),
  /**
   * The measured cache verdict behind a cost signal, structured rather than prose so a
   * receiving agent does not have to parse numbers out of a sentence. Deliberately the
   * same shape LAT-811 would expose, so publishing it stays a mapping — but this is an
   * internal payload today, not an API contract.
   */
  cacheFinding: z
    .object({
      provider: z.string(),
      model: z.string(),
      state: z.enum(["cacheIt", "stopCaching", "investigate"]),
      urgency: z.string().nullable(),
      actualRate: z.number(),
      breakEvenRate: z.number(),
      ceilingRate: z.number(),
      /** Modeled from tokens times registry prices; will not tie to recorded spend. */
      estimatedSavingsUsd: z.number(),
      calls: z.number(),
      cacheLifetimeSeconds: z.number(),
      windowDays: z.number(),
    })
    .optional(),
  incident: z
    .object({
      id: z.string(),
      severity: z.string(),
    })
    .optional(),
  monitor: z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      ruleSummary: z.string().optional(),
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
  sampleConversations: z
    .array(
      z.object({
        traceId: z.string(),
        scoreFeedback: z.string().optional(),
        excerpt: z.string(),
      }),
    )
    .optional(),
})

export type AgentDispatchContext = z.infer<typeof agentDispatchContextSchema>
