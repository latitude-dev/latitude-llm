import { Effect } from "effect"
import { SANDBOX_TRACE_SIGNAL_COALESCE_MS } from "../constants.ts"
import { SandboxSignals } from "../ports/sandbox-signals.ts"

export interface SandboxTraceRef {
  readonly traceId: string
  readonly sessionId: string
}

/**
 * Publish the realtime per-trace pulse for a sandbox batch — deduped per trace
 * (first `sessionId` wins) and coalesced per (kind, trace) in the adapter. `kind`
 * is `"liveness"` (pre-persist, from the HTTP boundary) or `"upsert"`
 * (post-persist, from the worker). Ids only — never trace content.
 *
 * Callers pass the raw trace refs (e.g. one per persisted span); the dedupe lives
 * here so the call sites stay a single line.
 */
export const publishSandboxTraceSignalsUseCase = Effect.fn("sandboxes.publishTraceSignals")(function* (input: {
  readonly organizationId: string
  readonly kind: "liveness" | "upsert"
  readonly traces: readonly SandboxTraceRef[]
}) {
  const signals = yield* SandboxSignals

  const sessionByTrace = new Map<string, string>()
  for (const trace of input.traces) {
    if (!sessionByTrace.has(trace.traceId)) {
      sessionByTrace.set(trace.traceId, trace.sessionId)
    }
  }

  for (const [traceId, sessionId] of sessionByTrace) {
    yield* signals.publishTraceSignal({
      kind: input.kind,
      organizationId: input.organizationId,
      traceId,
      sessionId,
      coalesceMs: SANDBOX_TRACE_SIGNAL_COALESCE_MS,
    })
  }
})
