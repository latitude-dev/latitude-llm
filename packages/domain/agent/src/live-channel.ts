import { z } from "zod"

/** TTL for the per-session live event stream in Redis; refreshed on each write. */
export const AGENT_EVENTS_TTL_SECONDS = 600

/** Redis Stream of live events for one session's in-flight turn (worker writes, SSE route tails). */
export const buildAgentEventsStreamKey = (organizationId: string, sessionId: string): string =>
  `org:${organizationId}:agent:${sessionId}:events`

/** Idempotency claim for a turn job (`SET NX`). */
export const buildAgentTurnClaimKey = (organizationId: string, turnId: string): string =>
  `org:${organizationId}:agent:turn:${turnId}:claim`

/** Where the web writes a confirmation decision and the worker polls for it. */
export const buildAgentDecisionKey = (organizationId: string, sessionId: string, toolCallId: string): string =>
  `org:${organizationId}:agent:${sessionId}:decision:${toolCallId}`

/** Set by the web to signal the worker to abort the running turn. */
export const buildAgentAbortKey = (organizationId: string, sessionId: string): string =>
  `org:${organizationId}:agent:${sessionId}:abort`

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), text: z.string() }),
  z.object({ type: z.literal("tool_activity"), toolName: z.string(), access: z.string() }),
  z.object({
    type: z.literal("confirmation_request"),
    toolCallId: z.string(),
    toolName: z.string(),
    access: z.string(),
    title: z.string(),
    summary: z.string(),
    input: z.unknown(),
  }),
  z.object({ type: z.literal("confirmation_resolved"), toolCallId: z.string(), approved: z.boolean() }),
  z.object({ type: z.literal("navigate"), to: z.string() }),
  z.object({ type: z.literal("assistant_message"), text: z.string() }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), error: z.string() }),
])

export type AgentEvent = z.infer<typeof agentEventSchema>

export const agentConfirmationDecisionSchema = z.enum(["approve", "deny"])
export type AgentConfirmationDecision = z.infer<typeof agentConfirmationDecisionSchema>
