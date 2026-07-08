import { agentMessageIdSchema, agentSessionIdSchema, organizationIdSchema } from "@domain/shared"
import { z } from "zod"

export const agentMessageRoleSchema = z.enum(["user", "assistant", "tool"])
export type AgentMessageRole = z.infer<typeof agentMessageRoleSchema>

/**
 * A single content part of a stored message. Structurally identical to
 * `@domain/ai`'s `AgentMessagePart` so the worker can hand a rehydrated
 * transcript straight to the agent loop and persist its response back.
 */
export const agentMessagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool-call"), toolCallId: z.string(), toolName: z.string(), input: z.unknown() }),
  z.object({ type: z.literal("tool-result"), toolCallId: z.string(), toolName: z.string(), output: z.unknown() }),
])
export type AgentMessagePart = z.infer<typeof agentMessagePartSchema>

export const agentMessageSchema = z.object({
  id: agentMessageIdSchema,
  organizationId: organizationIdSchema,
  sessionId: agentSessionIdSchema,
  seq: z.number().int().nonnegative(),
  role: agentMessageRoleSchema,
  parts: z.array(agentMessagePartSchema),
  createdAt: z.date(),
})

/** A persisted transcript message. Named `Record` to avoid clashing with `@domain/ai`'s `AgentMessage`. */
export type AgentMessageRecord = z.infer<typeof agentMessageSchema>

/** Normalizes a loop message's `content` (string or parts) into the stored parts array. */
export const contentToParts = (content: string | ReadonlyArray<AgentMessagePart>): AgentMessagePart[] =>
  typeof content === "string" ? [{ type: "text", text: content }] : [...content]
