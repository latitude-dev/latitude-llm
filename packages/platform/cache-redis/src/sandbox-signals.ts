import {
  buildSandboxActivityStampKey,
  buildSandboxQuotaKey,
  buildSandboxRejectedIngestKey,
  buildSandboxTraceCoalesceKey,
  buildSandboxTracesChannel,
  SANDBOX_LAST_REJECTED_INGEST_TTL_SECONDS,
  SandboxSignals,
} from "@domain/sandboxes"
import { Effect, Layer } from "effect"
import type { RedisClient } from "./client.ts"

const secondsUntil = (date: Date): number => Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000))

/**
 * Redis-backed {@link SandboxSignals}. Every method fails open: a Redis outage
 * must never drop an otherwise-valid sandbox trace, so quota errors allow the
 * ingest, the activity debounce skips the write, and marker/publish become
 * no-ops.
 */
export const SandboxSignalsLive = (redis: RedisClient): Layer.Layer<SandboxSignals> =>
  Layer.succeed(SandboxSignals, {
    incrementSpanQuota: (input) =>
      Effect.tryPromise({
        try: async () => {
          const key = buildSandboxQuotaKey(input.organizationId, input.periodStart)
          const total = await redis.incrby(key, input.spanCount)
          // First write into a fresh period key: pin the TTL to the period end so
          // the counter resets itself. `-1` means "set but no expiry yet".
          if (total === input.spanCount || (await redis.ttl(key)) === -1) {
            await redis.expire(key, secondsUntil(input.periodEnd))
          }
          return total
        },
        catch: (error) => error,
      }).pipe(Effect.catch(() => Effect.succeed(0))),

    recordRejectedIngest: (input) =>
      Effect.tryPromise({
        try: () =>
          redis.set(
            buildSandboxRejectedIngestKey(input.organizationId),
            JSON.stringify(input.marker),
            "EX",
            SANDBOX_LAST_REJECTED_INGEST_TTL_SECONDS,
          ),
        catch: (error) => error,
      }).pipe(Effect.catch(() => Effect.void)),

    tryAcquireActivityStamp: (input) =>
      Effect.tryPromise({
        try: () => redis.set(buildSandboxActivityStampKey(input.organizationId), "1", "PX", input.debounceMs, "NX"),
        catch: (error) => error,
      }).pipe(
        Effect.map((result) => result === "OK"),
        Effect.catch(() => Effect.succeed(false)),
      ),

    publishTraceSignal: (input) =>
      Effect.tryPromise({
        try: async () => {
          // Coalesce per (kind, trace): only the window winner publishes, so a
          // chatty trace pulses ~once per `coalesceMs` per kind instead of once
          // per span — and a liveness pulse never suppresses the later upsert.
          const won = await redis.set(
            buildSandboxTraceCoalesceKey(input.organizationId, input.kind, input.traceId),
            "1",
            "PX",
            input.coalesceMs,
            "NX",
          )
          if (won !== "OK") return
          await redis.publish(
            buildSandboxTracesChannel(input.organizationId),
            JSON.stringify({
              kind: input.kind,
              organizationId: input.organizationId,
              traceId: input.traceId,
              sessionId: input.sessionId,
            }),
          )
        },
        catch: (error) => error,
      }).pipe(Effect.catch(() => Effect.void)),
  })
