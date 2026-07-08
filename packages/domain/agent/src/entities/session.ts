import { agentSessionIdSchema, organizationIdSchema, projectIdSchema, userIdSchema } from "@domain/shared"
import { z } from "zod"

export const agentSessionSchema = z.object({
  id: agentSessionIdSchema,
  organizationId: organizationIdSchema,
  userId: userIdSchema,
  /** The project active when the session started, if any. The agent is not pinned to it. */
  projectId: projectIdSchema.nullable(),
  title: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type AgentSession = z.infer<typeof agentSessionSchema>
