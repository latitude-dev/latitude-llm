import {
  BillingSpendReservation,
  type BillingSpendReservationInput,
  type BillingSpendReservationShape,
} from "@domain/billing"
import { CacheError, type OrganizationId } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { RedisClient } from "./client.ts"

/**
 * Atomic Redis reservation script.
 *
 * Inputs:
 *   KEYS[1] = period counter key (current reserved consumed credits as a string number)
 *   KEYS[2] = idempotency-set key (members are reservation idempotency keys for the period)
 *   ARGV[1] = idempotencyKey
 *   ARGV[2] = creditsRequested
 *   ARGV[3] = maxAllowedConsumedCredits
 *   ARGV[4] = fallbackConsumedCredits (used to seed the counter when the key is missing)
 *   ARGV[5] = ttlSeconds
 *
 * Returns:
 *   1 if the reservation succeeded (counter advanced, key recorded as reserved)
 *   1 if the idempotency key was already reserved (no-op success — matches Postgres event dedupe)
 *   0 if the reservation would exceed the cap (counter unchanged)
 *
 * Atomicity: Redis runs each EVAL invocation as a single, indivisible script. No other client
 * can interleave between the GET, the comparison, and the INCRBY/SADD. That is the property
 * the use-case relies on — without it the GET-then-INCRBY race in the use-case would simply
 * move from Postgres to Redis without solving anything.
 */
const reserveScript = `
if redis.call("SISMEMBER", KEYS[2], ARGV[1]) == 1 then
  return 1
end

local current
local existing = redis.call("GET", KEYS[1])
if existing then
  current = tonumber(existing)
else
  current = tonumber(ARGV[4])
  redis.call("SET", KEYS[1], current, "EX", tonumber(ARGV[5]))
end

local credits = tonumber(ARGV[2])
local cap = tonumber(ARGV[3])

if current + credits > cap then
  return 0
end

redis.call("INCRBY", KEYS[1], credits)
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[5]))
redis.call("SADD", KEYS[2], ARGV[1])
redis.call("EXPIRE", KEYS[2], tonumber(ARGV[5]))
return 1
`

const buildKeys = (input: Pick<BillingSpendReservationInput, "organizationId" | "periodStart" | "periodEnd">) => {
  const periodSegment = `${input.periodStart.toISOString()}:${input.periodEnd.toISOString()}`
  return {
    counterKey: buildCounterKey(input.organizationId, periodSegment),
    idempotencySetKey: buildIdempotencySetKey(input.organizationId, periodSegment),
  }
}

// The `{${organizationId}}` hash tag colocates the counter and idempotency-set keys on the same
// Redis Cluster slot. EVAL requires every KEYS[*] argument to map to one slot — without the hash
// tag, the two keys hash independently and cluster-mode Redis returns CROSSSLOT.
const buildCounterKey = (organizationId: OrganizationId, periodSegment: string): string =>
  `org:{${organizationId}}:billing:spend-reservation:${periodSegment}:reserved`

const buildIdempotencySetKey = (organizationId: OrganizationId, periodSegment: string): string =>
  `org:{${organizationId}}:billing:spend-reservation:${periodSegment}:keys`

export const RedisBillingSpendReservationLive = (redis: RedisClient) =>
  Layer.succeed(BillingSpendReservation, {
    tryReserve: (input) =>
      Effect.gen(function* () {
        const { counterKey, idempotencySetKey } = buildKeys(input)

        const result = yield* Effect.tryPromise({
          try: () =>
            redis.eval(
              reserveScript,
              2,
              counterKey,
              idempotencySetKey,
              input.idempotencyKey,
              input.creditsRequested.toString(),
              input.maxAllowedConsumedCredits.toString(),
              input.fallbackConsumedCredits.toString(),
              input.ttlSeconds.toString(),
            ),
          catch: (cause) =>
            new CacheError({
              message: `billing spend reservation failed: ${String(cause)}`,
              cause,
            }),
        })

        return Number(result) === 1
      }),
  } satisfies BillingSpendReservationShape)
