import {
  externalUserIdSchema,
  organizationIdSchema,
  projectIdSchema,
  sessionIdSchema,
  simulationIdSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * Session — aggregated from spans that share a session_id.
 *
 * A session groups one or more traces representing multi-turn
 * interactions between a user and the system. Populated by a
 * ClickHouse materialized view on each insert into spans.
 */
export const sessionSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,

  traceCount: z.number().int().nonnegative(),
  traceIds: z.array(z.string()).readonly(),
  spanCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),

  startTime: z.date(),
  endTime: z.date(),
  durationNs: z.number(),

  tokensInput: z.number(),
  tokensOutput: z.number(),
  tokensCacheRead: z.number(),
  tokensCacheCreate: z.number(),
  tokensReasoning: z.number(),
  tokensTotal: z.number(),

  costInputMicrocents: z.number(),
  costOutputMicrocents: z.number(),
  costTotalMicrocents: z.number(),

  userId: externalUserIdSchema,
  simulationId: z.union([z.literal(""), simulationIdSchema]), // optional simulation CUID link, empty string when absent
  tags: z.array(z.string()).readonly(),
  metadata: z.record(z.string(), z.string()).readonly(),
  models: z.array(z.string()).readonly(),
  providers: z.array(z.string()).readonly(),
  serviceNames: z.array(z.string()).readonly(),
})

export type Session = z.infer<typeof sessionSchema>
