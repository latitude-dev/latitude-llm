import { describe, expect, it } from "vitest"
import {
  checkTraceIngestionRateLimit,
  enforceTraceIngestionRateLimit,
  SANDBOX_TRACE_INGESTION_RATE_LIMIT,
  type TraceIngestionRateLimitRedis,
} from "./trace-ingestion.ts"

type PipelineCommand =
  | { readonly type: "incr"; readonly key: string }
  | {
      readonly type: "incrby"
      readonly key: string
      readonly increment: number
    }
  | { readonly type: "ttl"; readonly key: string }

class FakeRedisPipeline {
  private commands: PipelineCommand[] = []

  constructor(private readonly redis: FakeRedis) {}

  incr(key: string) {
    this.commands.push({ type: "incr", key })
    return this
  }

  incrby(key: string, increment: number) {
    this.commands.push({ type: "incrby", key, increment })
    return this
  }

  ttl(key: string) {
    this.commands.push({ type: "ttl", key })
    return this
  }

  async exec() {
    return this.commands.map((command) => [null, this.redis.execute(command)] as const)
  }
}

class FakeRedis implements TraceIngestionRateLimitRedis {
  private readonly values = new Map<string, number>()
  private readonly ttls = new Map<string, number>()

  pipeline() {
    return new FakeRedisPipeline(this)
  }

  async expire(key: string, seconds: number) {
    this.ttls.set(key, seconds)
    return 1
  }

  execute(command: PipelineCommand): number {
    switch (command.type) {
      case "incr": {
        const value = (this.values.get(command.key) ?? 0) + 1
        this.values.set(command.key, value)
        return value
      }
      case "incrby": {
        const value = (this.values.get(command.key) ?? 0) + command.increment
        this.values.set(command.key, value)
        return value
      }
      case "ttl": {
        if (!this.values.has(command.key)) return -2
        return this.ttls.get(command.key) ?? -1
      }
    }
  }
}

class ThrowingRedis implements TraceIngestionRateLimitRedis {
  pipeline() {
    return {
      incr: () => this.pipeline(),
      incrby: () => this.pipeline(),
      ttl: () => this.pipeline(),
      exec: async () => {
        throw new Error("redis unavailable")
      },
    }
  }

  async expire() {
    return 1
  }
}

const testConfig = {
  maxRequests: 2,
  maxBytes: 100,
  windowSeconds: 30,
} as const

const createInput = (redis: TraceIngestionRateLimitRedis, payloadBytes: number) => ({
  redis,
  organizationId: "org-1",
  apiKeyId: "key-1",
  payloadBytes,
})

describe("checkTraceIngestionRateLimit", () => {
  it("allows requests within the configured request and byte limits", async () => {
    const redis = new FakeRedis()

    const result = await enforceTraceIngestionRateLimit(createInput(redis, 40), testConfig)

    expect(result).toEqual({ allowed: true })
  })

  it("blocks when the request count exceeds the configured limit", async () => {
    const redis = new FakeRedis()

    await enforceTraceIngestionRateLimit(createInput(redis, 10), testConfig)
    await enforceTraceIngestionRateLimit(createInput(redis, 10), testConfig)
    const result = await enforceTraceIngestionRateLimit(createInput(redis, 10), testConfig)

    expect(result).toEqual({
      allowed: false,
      limitedBy: "requests",
      retryAfterSeconds: 30,
    })
  })

  it("blocks when the total ingested bytes exceed the configured limit", async () => {
    const redis = new FakeRedis()

    await enforceTraceIngestionRateLimit(createInput(redis, 60), testConfig)
    const result = await enforceTraceIngestionRateLimit(createInput(redis, 60), testConfig)

    expect(result).toEqual({
      allowed: false,
      limitedBy: "bytes",
      retryAfterSeconds: 30,
    })
  })

  it("fails open when redis is unavailable", async () => {
    const result = await enforceTraceIngestionRateLimit(createInput(new ThrowingRedis(), 60), testConfig)

    expect(result).toEqual({ allowed: true })
  })

  it("applies the flat sandbox ceiling when isSandbox is set", async () => {
    const redis = new FakeRedis()
    const sandboxInput = {
      redis,
      organizationId: "org-1",
      apiKeyId: "key-1",
      payloadBytes: 10,
      isSandbox: true,
    }

    for (let i = 0; i < SANDBOX_TRACE_INGESTION_RATE_LIMIT.maxRequests; i++) {
      expect(await checkTraceIngestionRateLimit(sandboxInput)).toEqual({
        allowed: true,
      })
    }
    const overLimit = await checkTraceIngestionRateLimit(sandboxInput)

    expect(overLimit).toEqual({
      allowed: false,
      limitedBy: "requests",
      retryAfterSeconds: SANDBOX_TRACE_INGESTION_RATE_LIMIT.windowSeconds,
    })
  })

  it("rate-limits across projects within the same org+apiKey (no `projectId` in the key)", async () => {
    // Per-span project scoping moved project resolution into the use case. The rate-limit
    // bucket is now `org + apiKey`, matching billing's scope — two projects in the same org
    // share the same trace-ingestion allowance.
    const redis = new FakeRedis()

    await enforceTraceIngestionRateLimit(createInput(redis, 10), testConfig)
    await enforceTraceIngestionRateLimit(createInput(redis, 10), testConfig)
    const third = await enforceTraceIngestionRateLimit(createInput(redis, 10), testConfig)

    expect(third).toEqual({
      allowed: false,
      limitedBy: "requests",
      retryAfterSeconds: 30,
    })
  })
})
