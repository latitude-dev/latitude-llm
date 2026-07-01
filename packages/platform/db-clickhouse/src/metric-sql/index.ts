import type { AnalyticsStream } from "@domain/shared"
import { behaviorsDescriptor } from "./streams/behaviors.ts"
import { momentsDescriptor } from "./streams/moments.ts"
import { scoresDescriptor } from "./streams/scores.ts"
import { sessionsDescriptor } from "./streams/sessions.ts"
import { spansDescriptor } from "./streams/spans.ts"
import { tracesDescriptor } from "./streams/traces.ts"
import type { StreamDescriptor } from "./types.ts"

const STREAMS: { [S in AnalyticsStream]: StreamDescriptor<S> } = {
  traces: tracesDescriptor,
  sessions: sessionsDescriptor,
  spans: spansDescriptor,
  scores: scoresDescriptor,
  behaviors: behaviorsDescriptor,
  moments: momentsDescriptor,
}

/** The descriptor for a stream — its inner query, aggregate, breakdowns, and time column. */
export const streamFor = <S extends AnalyticsStream>(stream: S): StreamDescriptor<S> => STREAMS[stream]

export type { BreakdownExpr } from "./types.ts"
