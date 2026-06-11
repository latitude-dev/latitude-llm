import {
  DETECTOR_HEALTH_DEGRADED_ERROR_RATE,
  DETECTOR_HEALTH_MIN_RUNS,
  DETECTOR_HEALTH_WINDOW_SECONDS,
  DetectorHealthTracker,
  type DetectorHealthTrackerShape,
  type DetectorRunRecord,
} from "@domain/sandbox"
import { CacheError } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { RedisClient } from "./client.ts"

/**
 * Fixed-window run/error counters per detector owner. `INCR` keeps the
 * counters atomic and the `SET NX` on the degraded marker makes the
 * degraded *transition* fire exactly once per window, so consumers can emit
 * a single surfacing event without their own dedupe.
 */
const buildKeys = (input: DetectorRunRecord) => {
  const base = `org:${input.organizationId}:detector-health:${input.ownerType}:${input.ownerId}`
  return {
    runsKey: `${base}:runs`,
    errorsKey: `${base}:errors`,
    degradedKey: `${base}:degraded`,
  }
}

export const RedisDetectorHealthTrackerLive = (redis: RedisClient) =>
  Layer.succeed(DetectorHealthTracker, {
    recordRun: (input) =>
      Effect.tryPromise({
        try: async () => {
          const { runsKey, errorsKey, degradedKey } = buildKeys(input)

          const runs = await redis.incr(runsKey)
          if (runs === 1) await redis.expire(runsKey, DETECTOR_HEALTH_WINDOW_SECONDS)

          let errors: number
          if (input.errored) {
            errors = await redis.incr(errorsKey)
            if (errors === 1) await redis.expire(errorsKey, DETECTOR_HEALTH_WINDOW_SECONDS)
          } else {
            const stored = await redis.get(errorsKey)
            errors = stored === null ? 0 : Number(stored)
          }

          const degraded = runs >= DETECTOR_HEALTH_MIN_RUNS && errors / runs >= DETECTOR_HEALTH_DEGRADED_ERROR_RATE

          let newlyDegraded = false
          if (degraded) {
            const marked = await redis.set(degradedKey, "1", "EX", DETECTOR_HEALTH_WINDOW_SECONDS, "NX")
            newlyDegraded = marked === "OK"
          }

          return { runs, errors, degraded, newlyDegraded }
        },
        catch: (cause) =>
          new CacheError({
            message: `detector health recording failed: ${String(cause)}`,
            cause,
          }),
      }),
  } satisfies DetectorHealthTrackerShape)
