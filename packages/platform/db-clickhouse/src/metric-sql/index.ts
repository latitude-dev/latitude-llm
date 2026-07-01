import type { MonitorStream } from "@domain/shared"
import { sessionsDescriptor } from "./streams/sessions.ts"
import { spansDescriptor } from "./streams/spans.ts"
import { tracesDescriptor } from "./streams/traces.ts"
import type { StreamDescriptor } from "./types.ts"

const STREAMS: Record<MonitorStream, StreamDescriptor> = {
  traces: tracesDescriptor,
  sessions: sessionsDescriptor,
  spans: spansDescriptor,
}

/** The descriptor for a stream — its inner query, aggregate, breakdowns, and time column. */
export const streamFor = (stream: MonitorStream): StreamDescriptor => STREAMS[stream]

export type { BreakdownExpr } from "./types.ts"
