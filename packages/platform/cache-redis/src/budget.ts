import { Effect } from "effect"
import type { RedisClient } from "./client.ts"

interface ReserveRedisBudgetInput {
  readonly key: string
  readonly reservationId: string
  readonly units: number
  readonly limit: number
  readonly ttlSeconds: number
}

const reserveBudgetScript = `
if redis.call("HEXISTS", KEYS[1], ARGV[1]) == 1 then
  return 1
end
local used = tonumber(redis.call("HGET", KEYS[1], "used") or "0")
local units = tonumber(ARGV[2])
if used + units > tonumber(ARGV[3]) then
  return 0
end
redis.call("HINCRBY", KEYS[1], "used", units)
redis.call("HSET", KEYS[1], ARGV[1], units)
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[4]))
return 1
`

export const reserveRedisBudget = (redis: RedisClient, input: ReserveRedisBudgetInput): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: () =>
      redis.eval(
        reserveBudgetScript,
        1,
        input.key,
        `reservation:${input.reservationId}`,
        input.units,
        input.limit,
        input.ttlSeconds,
      ),
    catch: () => undefined,
  }).pipe(
    Effect.map((result) => result === 1),
    Effect.catch(() =>
      Effect.logWarning("AI analysis budget unavailable; skipping automatic classification").pipe(Effect.as(false)),
    ),
  )
