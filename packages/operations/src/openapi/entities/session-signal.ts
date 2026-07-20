import { cuidSchema } from "@domain/shared"
import type { SessionSignal } from "@domain/signals"
import { SIGNAL_SOURCES, SIGNAL_STATES } from "@domain/signals"
import { z } from "@hono/zod-openapi"

export const SessionSignalSchema = z
  .object({
    id: cuidSchema.describe("Stable signal identifier."),
    slug: z.string().describe("URL-safe identifier; use it on the session's single-signal endpoint."),
    name: z.string().describe("Human-readable signal name."),
    description: z.string().describe("What this signal captures."),
    source: z.enum(SIGNAL_SOURCES).describe("Where the signal originated from."),
    states: z
      .array(z.enum(SIGNAL_STATES))
      .describe("Lifecycle states currently active for the signal (e.g. `new`, `escalating`, `ongoing`)."),
    occurrences: z.number().int().nonnegative().describe("Number of occurrences recorded across the session's traces."),
    firstSeenAt: z.string().describe("ISO-8601 timestamp of the first occurrence within the session."),
    lastSeenAt: z.string().describe("ISO-8601 timestamp of the most recent occurrence within the session."),
    traceIds: z
      .array(z.string())
      .describe("Distinct traces in the session that contributed at least one score to this signal."),
  })
  .openapi("SessionSignal")

export const SessionSignalsSchema = z
  .object({
    items: z
      .array(SessionSignalSchema)
      .describe("Signals recorded across the session's traces, ordered by most recent occurrence first."),
  })
  .openapi("SessionSignals")

export const toSessionSignalResponse = (signal: SessionSignal) => ({
  id: signal.signalId,
  slug: signal.slug,
  name: signal.name,
  description: signal.description,
  source: signal.source as (typeof SIGNAL_SOURCES)[number],
  states: [...signal.states] as (typeof SIGNAL_STATES)[number][],
  occurrences: signal.occurrences,
  firstSeenAt: signal.firstSeenAt.toISOString(),
  lastSeenAt: signal.lastSeenAt.toISOString(),
  traceIds: [...signal.traceIds],
})
