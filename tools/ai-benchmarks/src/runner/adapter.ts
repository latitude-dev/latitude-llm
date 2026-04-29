import { createHash } from "node:crypto"
import { ExternalUserId, OrganizationId, ProjectId, SessionId, SimulationId, SpanId, TraceId } from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import type { FixtureRow } from "../types.ts"
import { BENCHMARK_ORG_ID, BENCHMARK_PROJECT_ID } from "./benchmark-identity.ts"

const BENCHMARK_SESSION_ID = "benchmark-session"
const BENCHMARK_USER_ID = "benchmark-user"
const BENCHMARK_ROOT_SPAN_ID = "b".repeat(16)
const BENCHMARK_TIME = new Date("2026-01-01T00:00:00.000Z")

/**
 * Build a `TraceDetail` from a `FixtureRow`. Only `allMessages` is varied per
 * row; everything else is a stable default. The flagger strategies read
 * `allMessages` (and for a few strategies, derived shape from the messages
 * themselves) — they don't touch tokens, costs, timings, or IDs, so zero
 * defaults are fine.
 */
export function fixtureRowToTraceDetail(row: FixtureRow): TraceDetail {
  const messages = row.trace.messages as TraceDetail["allMessages"]
  // `traceId` must fit the 32-char `TraceId` brand. Naively padEnd/slice on
  // `row.id` collides for fixtures with a long shared prefix (e.g. multiple
  // `jailbreakbench-pair-black-box-gpt-3.5-turbo-1106-…` rows truncate to
  // the same 32 chars), which makes traces ambiguous in the inspector and
  // would skew anything keyed on traceId. Hashing is collision-resistant
  // and stable across runs for the same row id.
  const traceId = createHash("sha256").update(row.id).digest("hex").slice(0, 32)
  // A fixture with `trace.systemPrompt` should classify as though the trace had
  // a real system instruction; otherwise it becomes a no-op field and the
  // inspector shows data that didn't affect the decision.
  const systemInstructions: TraceDetail["systemInstructions"] =
    row.trace.systemPrompt !== undefined ? [{ type: "text", content: row.trace.systemPrompt }] : []
  return {
    organizationId: OrganizationId(BENCHMARK_ORG_ID),
    projectId: ProjectId(BENCHMARK_PROJECT_ID),
    traceId: TraceId(traceId),
    spanCount: 1,
    errorCount: 0,
    startTime: BENCHMARK_TIME,
    endTime: BENCHMARK_TIME,
    durationNs: 0,
    timeToFirstTokenNs: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    tokensTotal: 0,
    costInputMicrocents: 0,
    costOutputMicrocents: 0,
    costTotalMicrocents: 0,
    sessionId: SessionId(BENCHMARK_SESSION_ID),
    userId: ExternalUserId(BENCHMARK_USER_ID),
    simulationId: SimulationId(""),
    tags: [],
    metadata: {},
    models: [],
    providers: [],
    serviceNames: [],
    rootSpanId: SpanId(BENCHMARK_ROOT_SPAN_ID),
    rootSpanName: "benchmark",
    systemInstructions,
    inputMessages: [],
    outputMessages: messages,
    allMessages: messages,
  }
}
