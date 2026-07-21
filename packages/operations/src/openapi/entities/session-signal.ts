import type { SessionSignal, SIGNAL_SOURCES, SIGNAL_STATES } from "@domain/signals"
import { z } from "@hono/zod-openapi"
import { signalIdentityFields } from "./signal.ts"

export const SessionSignalSchema = z
  .object({
    ...signalIdentityFields,
    occurrences: z.number().int().nonnegative().describe("Number of occurrences within the session."),
    firstSeenAt: z.string().describe("ISO-8601 timestamp of the earliest occurrence in the session."),
    lastSeenAt: z.string().describe("ISO-8601 timestamp of the latest occurrence in the session."),
    traceIds: z.array(z.string()).describe("Traces of the session where the signal occurred."),
  })
  .openapi("SessionSignal")

export const SessionSignalsSchema = z
  .object({
    items: z
      .array(SessionSignalSchema)
      .describe("Signals that occurred in the session, ordered by most recent occurrence first."),
  })
  .openapi("SessionSignals")

export const toSessionSignalResponse = (signal: SessionSignal, organizationId: string) => ({
  id: signal.id,
  organizationId,
  projectId: signal.projectId,
  slug: signal.slug,
  name: signal.name,
  description: signal.description,
  source: signal.source as (typeof SIGNAL_SOURCES)[number],
  states: [...signal.states] as (typeof SIGNAL_STATES)[number][],
  mutedAt: signal.mutedAt ? signal.mutedAt.toISOString() : null,
  createdAt: signal.createdAt.toISOString(),
  updatedAt: signal.updatedAt.toISOString(),
  occurrences: signal.occurrences,
  firstSeenAt: signal.firstSeenAt.toISOString(),
  lastSeenAt: signal.lastSeenAt.toISOString(),
  traceIds: [...signal.traceIds],
})
