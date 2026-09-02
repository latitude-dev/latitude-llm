/**
 * Flushing for agents that live in a Durable Object.
 *
 * A Durable Object is evicted whenever it goes idle, with no hook to run first, and the batch span
 * processor's timer is not a scheduler the runtime keeps alive — a batch still queued when the
 * object goes away is simply lost. The only reliable discipline is to flush at the end of every
 * unit of work the object performs: a turn, an RPC method, a `fetch`, an alarm.
 *
 * That makes flushing frequent, so it has to be cheap and safe to call: flushes are serialized,
 * concurrent callers collapse onto one export, and a failing export never surfaces into the work
 * being traced.
 */

import type { Latitude } from "./init.ts"

/**
 * The slice of `DurableObjectState` / `ExecutionContext` this helper uses, structurally typed so
 * the SDK carries no dependency on `@cloudflare/workers-types`.
 */
export type DurableObjectLifecycle = {
  waitUntil?: (promise: Promise<unknown>) => void
}

export type DurableObjectTelemetryOptions = {
  readonly latitude: Pick<Latitude, "flush">
  /** `this.ctx` of the Durable Object. Registers in-flight exports so the runtime waits for them. */
  readonly ctx?: DurableObjectLifecycle
  /** Defaults to `console.error`. An export failure must not fail the work being traced. */
  readonly onError?: (error: unknown) => void
}

export type DurableObjectTelemetry = {
  /** Runs a unit of work and flushes once it settles, whether it resolved or threw. */
  readonly run: <T>(work: () => T | Promise<T>) => Promise<T>
  /** Exports everything buffered so far. Concurrent callers share one export. */
  readonly flush: () => Promise<void>
  /** Flushes without waiting, handing the export to `ctx.waitUntil()` when one was supplied. */
  readonly flushSoon: () => void
}

export function createDurableObjectTelemetry(options: DurableObjectTelemetryOptions): DurableObjectTelemetry {
  const onError = options.onError ?? ((error: unknown) => console.error("[Latitude] Failed to flush spans:", error))

  let chain: Promise<void> = Promise.resolve()
  let queued = false

  const flush = (): Promise<void> => {
    // A caller arriving while an export is in flight needs a later one: spans that ended after it
    // started are not in it. A caller arriving while one is merely queued can share that queued run.
    if (queued) return chain

    queued = true
    chain = chain.then(async () => {
      queued = false
      try {
        await options.latitude.flush()
      } catch (error) {
        onError(error)
      }
    })

    const pending = chain
    // `waitUntil` throws once the request that owns the context has finished. The export still runs
    // to completion either way; registering it only asks the runtime to wait when it still can.
    try {
      options.ctx?.waitUntil?.(pending)
    } catch {}

    return pending
  }

  return {
    flush,
    flushSoon: () => void flush(),
    run: async (work) => {
      try {
        return await work()
      } finally {
        await flush()
      }
    },
  }
}
