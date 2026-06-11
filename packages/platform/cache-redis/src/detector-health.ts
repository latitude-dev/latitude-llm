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
 * Fixed-window run/error counters per detector owner. The window bucket is
 * encoded in the key so runs, errors, and the degraded marker always share
 * the same window — independent TTLs would let an errors key outlive its
 * runs key and fabricate an error rate > 1 at the next window's start.
 * `INCR` keeps the counters atomic and the `SET NX` on the degraded marker
 * makes the degraded *transition* fire exactly once per window, so consumers
 * can emit a single surfacing event without their own dedupe.
 */
const KEY_TTL_SECONDS = DETECTOR_HEALTH_WINDOW_SECONDS * 2

const buildKeys = (input: DetectorRunRecord, windowBucket: number) => {
  const base = `org:${input.organizationId}:detector-health:${input.ownerType}:${input.ownerId}:${windowBucket}`
  return {
    runsKey: `${base}:runs`,
    errorsKey: `${base}:errors`,
    degradedKey: `${base}:degraded`,
  }
}

const unwrapPipelineResults = (results: [error: Error | null, result: unknown][] | null): readonly unknown[] => {
  if (results === null) throw new Error("pipeline aborted")
  return results.map(([error, result]) => {
    if (error !== null) throw error
    return result
  })
}

export const RedisDetectorHealthTrackerLive = (redis: RedisClient) =>
  Layer.succeed(DetectorHealthTracker, {
    recordRun: (input) =>
      Effect.tryPromise({
        try: async () => {
          const windowBucket = Math.floor(Date.now() / (DETECTOR_HEALTH_WINDOW_SECONDS * 1_000))
          const { runsKey, errorsKey, degradedKey } = buildKeys(input, windowBucket)

          const pipeline = redis.pipeline()
          pipeline.incr(runsKey)
          pipeline.expire(runsKey, KEY_TTL_SECONDS)
          if (input.errored) {
            pipeline.incr(errorsKey)
            pipeline.expire(errorsKey, KEY_TTL_SECONDS)
          } else {
            pipeline.get(errorsKey)
          }
          const results = unwrapPipelineResults(await pipeline.exec())

          const runs = Number(results[0])
          const errors = input.errored ? Number(results[2]) : Number(results[2] ?? 0)

          const degraded = runs >= DETECTOR_HEALTH_MIN_RUNS && errors / runs >= DETECTOR_HEALTH_DEGRADED_ERROR_RATE

          let newlyDegraded = false
          if (degraded) {
            const marked = await redis.set(degradedKey, "1", "EX", KEY_TTL_SECONDS, "NX")
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
