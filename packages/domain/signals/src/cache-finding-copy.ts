import type { CacheFindingMeasures, CacheSignalState } from "@domain/spans"
import { SIGNAL_NAME_MAX_LENGTH } from "./constants.ts"

/**
 * The words a cache finding opens its signal with.
 *
 * Written here rather than generated: every number is already measured, so asking a
 * model to phrase them would add a failure mode and a cost to a sentence that has one
 * correct form. Deterministic copy also means the same finding reads identically in the
 * inbox, in a Slack notification, and in the brief a dispatched agent receives.
 *
 * `Investigate` names the category and stops. Every cache lever lives in the customer's
 * own prompt-construction code, and byte-level prefix comparison is something the
 * providers' own cache diagnostics do better with access we do not have.
 */
export interface CacheFindingCopy {
  readonly name: string
  readonly description: string
}

const percent = (rate: number): string => `${Math.round(rate * 1000) / 10}%`

const usd = (microcents: number): string => {
  const dollars = microcents / 100_000_000
  return dollars >= 10 ? `$${Math.round(dollars)}` : `$${(Math.round(dollars * 100) / 100).toFixed(2)}`
}

const headline: Readonly<Record<CacheSignalState, string>> = {
  cacheIt: "Prompt caching is off",
  stopCaching: "Prompt caching is costing more than it saves",
  investigate: "Prompt caching is underperforming what this traffic supports",
}

const body = (measures: CacheFindingMeasures): string => {
  const lifetime =
    measures.cacheLifetimeSeconds >= 3600
      ? `${measures.cacheLifetimeSeconds / 3600}h`
      : `${measures.cacheLifetimeSeconds / 60}m`
  const cadence = `Its own call cadence supports up to ${percent(measures.ceilingRate)} at this model's documented ${lifetime} cache lifetime, and caching pays for itself above ${percent(measures.breakEvenRate)}.`

  switch (measures.state) {
    case "cacheIt":
      return `${measures.model} on ${measures.provider} records no cache reads or writes across ${measures.calls} calls. ${cadence} Turning caching on would save an estimated ${usd(measures.modeledSavingsMicrocents)} over this window.`
    case "stopCaching":
      return `${measures.model} on ${measures.provider} is writing cache entries that are not being read back often enough to pay for the write premium, measured over ${measures.calls} calls at a ${percent(measures.actualRate)} hit rate. ${cadence} This traffic cannot reach that bar, so removing the cache breakpoints would save an estimated ${usd(measures.modeledSavingsMicrocents)} over this window.`
    case "investigate":
      return `${measures.model} on ${measures.provider} is reading ${percent(measures.actualRate)} of its input from cache over ${measures.calls} calls. ${cadence} Closing the gap is worth an estimated ${usd(measures.modeledSavingsMicrocents)} over this window. The levers all live in prompt construction: a timestamp or request id ahead of the cache breakpoint, non-deterministic key ordering when serializing the prompt, tool definitions that change between calls, or a breakpoint placed after the variable part of the prompt. Latitude sees the call after it happened and cannot tell which — the provider's own cache diagnostics can.`
  }
}

export function describeCacheFinding(measures: CacheFindingMeasures): CacheFindingCopy {
  return {
    name: `${headline[measures.state]} on ${measures.model}`.slice(0, SIGNAL_NAME_MAX_LENGTH),
    description: body(measures),
  }
}
