import { Effect } from "effect"
import type { SandboxRejectedIngestMarker, SandboxSignals } from "../ports/sandbox-signals.ts"

type SandboxSignalsShape = (typeof SandboxSignals)["Service"]

export interface FakeSandboxSignalsState {
  readonly quotaIncrements: { organizationId: string; spanCount: number }[]
  readonly rejected: { organizationId: string; marker: SandboxRejectedIngestMarker }[]
  readonly activityAcquisitions: string[]
  readonly published: {
    kind: "liveness" | "upsert"
    organizationId: string
    traceId: string
    sessionId: string
  }[]
}

/**
 * In-memory {@link SandboxSignals}. By default the quota counter accumulates per
 * org (so `incrementSpanQuota` returns a realistic running total) and the
 * activity stamp is always acquired. Override `incrementSpanQuota` to force an
 * over-quota total, or `tryAcquireActivityStamp` to exercise the debounce.
 */
export const createFakeSandboxSignals = (overrides?: Partial<SandboxSignalsShape>) => {
  const counters = new Map<string, number>()
  const state: FakeSandboxSignalsState = {
    quotaIncrements: [],
    rejected: [],
    activityAcquisitions: [],
    published: [],
  }

  const signals: SandboxSignalsShape = {
    incrementSpanQuota: (input) => {
      state.quotaIncrements.push({ organizationId: input.organizationId, spanCount: input.spanCount })
      const next = (counters.get(input.organizationId) ?? 0) + input.spanCount
      counters.set(input.organizationId, next)
      return Effect.succeed(next)
    },
    recordRejectedIngest: (input) =>
      Effect.sync(() => {
        state.rejected.push({ organizationId: input.organizationId, marker: input.marker })
      }),
    tryAcquireActivityStamp: (input) =>
      Effect.sync(() => {
        state.activityAcquisitions.push(input.organizationId)
        return true
      }),
    publishTraceSignal: (input) =>
      Effect.sync(() => {
        state.published.push({
          kind: input.kind,
          organizationId: input.organizationId,
          traceId: input.traceId,
          sessionId: input.sessionId,
        })
      }),
    ...overrides,
  }

  return { signals, state }
}
