import { Effect, Layer } from "effect"
import { DETECTOR_HEALTH_DEGRADED_ERROR_RATE, DETECTOR_HEALTH_MIN_RUNS } from "../constants.ts"
import {
  type DetectorHealthSnapshot,
  DetectorHealthTracker,
  type DetectorHealthTrackerShape,
  type DetectorRunRecord,
} from "../ports/detector-health.ts"

interface FakeDetectorHealthState {
  runs: number
  errors: number
  degradedSurfaced: boolean
}

export const createFakeDetectorHealthTracker = (overrides?: Partial<DetectorHealthTrackerShape>) => {
  const calls: DetectorRunRecord[] = []
  const states = new Map<string, FakeDetectorHealthState>()

  const defaultRecordRun = (input: DetectorRunRecord) =>
    Effect.sync<DetectorHealthSnapshot>(() => {
      const key = `${input.organizationId}:${input.ownerType}:${input.ownerId}`
      const state = states.get(key) ?? { runs: 0, errors: 0, degradedSurfaced: false }
      state.runs += 1
      if (input.errored) state.errors += 1
      const degraded =
        state.runs >= DETECTOR_HEALTH_MIN_RUNS && state.errors / state.runs >= DETECTOR_HEALTH_DEGRADED_ERROR_RATE
      const newlyDegraded = degraded && !state.degradedSurfaced
      if (degraded) state.degradedSurfaced = true
      states.set(key, state)
      return { runs: state.runs, errors: state.errors, degraded, newlyDegraded }
    })

  const tracker: DetectorHealthTrackerShape = {
    recordRun: (input) => {
      calls.push(input)
      return (overrides?.recordRun ?? defaultRecordRun)(input)
    },
  }

  return {
    tracker,
    calls,
    layer: Layer.succeed(DetectorHealthTracker, tracker),
  }
}
