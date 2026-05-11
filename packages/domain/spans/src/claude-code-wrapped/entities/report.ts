import { organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * Data shape passed to the Claude Code Wrapped email template. The MVP only
 * carries enough to prove the pipeline end-to-end (project identity, window,
 * and a single session count); subsequent iterations extend this schema with
 * the actual "Wrapped" data points (top files, tool mix, chronotype, ...).
 */
export const reportSchema = z.object({
  projectId: projectIdSchema,
  organizationId: organizationIdSchema,
  projectName: z.string(),
  windowStart: z.date(),
  windowEnd: z.date(),
  totalSessions: z.number().int().nonnegative(),
})

export type Report = z.infer<typeof reportSchema>
