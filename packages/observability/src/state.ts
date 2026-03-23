import type { ObservabilityState } from "./types.ts"

const OBSERVABILITY_STATE_KEY = Symbol.for("latitude.observability.state")
const globalWithObservabilityState = globalThis as typeof globalThis & {
  [OBSERVABILITY_STATE_KEY]?: ObservabilityState
}

export const getObservabilityState = (): ObservabilityState => {
  let state = globalWithObservabilityState[OBSERVABILITY_STATE_KEY]
  if (!state) {
    state = {
      initialized: false,
      enabled: false,
    }
    globalWithObservabilityState[OBSERVABILITY_STATE_KEY] = state
  }

  return state
}
