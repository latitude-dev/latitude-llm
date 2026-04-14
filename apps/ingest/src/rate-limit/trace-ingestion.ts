import { parseEnv } from "@platform/env"
import { Effect } from "effect"

const productionTraceRateLimitDefaults = {
  maxRequests: 600,
  maxBytes: 64 * 1024 * 1024,
  windowSeconds: 60,
} as const

const developmentTraceRateLimitDefaults = {
  maxRequests: 5_000,
  maxBytes: 512 * 1024 * 1024,
  windowSeconds: 60,
} as const

interface TraceIngestionRateLimitConfig {
  readonly maxRequests: number
  readonly maxBytes: number
  readonly windowSeconds: number
}

interface RedisPipeline {
  incr: (key: string) => RedisPipeline
  incrby: (key: string, increment: number) => RedisPipeline
  ttl: (key: string) => RedisPipeline
  exec: () => Promise<Array<readonly [unknown, unknown]> | null>
}

export interface TraceIngestionRateLimitRedis {
  pipeline: () => RedisPipeline
  expire: (key: string, seconds: number) => Promise<unknown>
}

interface CheckTraceIngestionRateLimitInput {
  readonly redis: TraceIngestionRateLimitRedis
  readonly organizationId: string
  readonly projectId: string
  readonly apiKeyId: string
  readonly payloadBytes: number
  readonly config?: TraceIngestionRateLimitConfig
}

type TraceIngestionRateLimitResult =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly limitedBy: "requests" | "bytes"
      readonly retryAfterSeconds: number
    }

const parsePositiveEnvNumber = (name: string, fallback: number): number => {
  const value = Effect.runSync(parseEnv(name, "number", fallback))
  if (value <= 0) {
    throw new Error(`${name} must be greater than 0`)
  }

  return value
}

const loadTraceIngestionRateLimitConfig = (): TraceIngestionRateLimitConfig => {
  const nodeEnv = Effect.runSync(parseEnv("NODE_ENV", "string", "development"))
  const defaults = nodeEnv === "development" ? developmentTraceRateLimitDefaults : productionTraceRateLimitDefaults

  return {
    maxRequests: parsePositiveEnvNumber("LAT_INGEST_TRACE_RATE_LIMIT_MAX_REQUESTS", defaults.maxRequests),
    maxBytes: parsePositiveEnvNumber("LAT_INGEST_TRACE_RATE_LIMIT_MAX_BYTES", defaults.maxBytes),
    windowSeconds: parsePositiveEnvNumber("LAT_INGEST_TRACE_RATE_LIMIT_WINDOW_SECONDS", defaults.windowSeconds),
  }
}

const defaultTraceIngestionRateLimitConfig = loadTraceIngestionRateLimitConfig()

const getNumericPipelineValue = (result: readonly [unknown, unknown]): number | null => {
  const value = result[1]
  return typeof value === "number" ? value : null
}

const normalizeRetryAfterSeconds = (ttl: number, fallback: number): number => {
  if (ttl > 0) return ttl
  return fallback
}

const buildRateLimitKey = (
  input: Omit<CheckTraceIngestionRateLimitInput, "redis" | "payloadBytes" | "config">,
): string => {
  return `ratelimit:ingest:traces:${input.organizationId}:${input.projectId}:${input.apiKeyId}`
}

export const checkTraceIngestionRateLimit = async (
  input: CheckTraceIngestionRateLimitInput,
): Promise<TraceIngestionRateLimitResult> => {
  const config = input.config ?? defaultTraceIngestionRateLimitConfig
  const baseKey = buildRateLimitKey(input)
  const requestsKey = `${baseKey}:requests`
  const bytesKey = `${baseKey}:bytes`

  try {
    const pipeline = input.redis.pipeline()
    pipeline.incr(requestsKey)
    pipeline.ttl(requestsKey)
    pipeline.incrby(bytesKey, input.payloadBytes)
    pipeline.ttl(bytesKey)

    const results = await pipeline.exec()
    if (!results) return { allowed: true }

    const [requestCountResult, requestTtlResult, bytesCountResult, bytesTtlResult] = results

    if (requestCountResult?.[0] || requestTtlResult?.[0] || bytesCountResult?.[0] || bytesTtlResult?.[0]) {
      return { allowed: true }
    }

    const requestCount = getNumericPipelineValue(requestCountResult)
    let requestTtl = getNumericPipelineValue(requestTtlResult)
    const totalBytes = getNumericPipelineValue(bytesCountResult)
    let bytesTtl = getNumericPipelineValue(bytesTtlResult)

    if (requestCount === null || requestTtl === null || totalBytes === null || bytesTtl === null) {
      return { allowed: true }
    }

    if (requestCount === 1 || requestTtl === -1) {
      await input.redis.expire(requestsKey, config.windowSeconds)
      requestTtl = config.windowSeconds
    }

    if (bytesTtl === -1) {
      await input.redis.expire(bytesKey, config.windowSeconds)
      bytesTtl = config.windowSeconds
    }

    const requestsLimited = requestCount > config.maxRequests
    const bytesLimited = totalBytes > config.maxBytes

    if (!requestsLimited && !bytesLimited) {
      return { allowed: true }
    }

    return {
      allowed: false,
      limitedBy: requestsLimited ? "requests" : "bytes",
      retryAfterSeconds: Math.max(
        requestsLimited ? normalizeRetryAfterSeconds(requestTtl, config.windowSeconds) : 0,
        bytesLimited ? normalizeRetryAfterSeconds(bytesTtl, config.windowSeconds) : 0,
      ),
    }
  } catch {
    return { allowed: true }
  }
}
