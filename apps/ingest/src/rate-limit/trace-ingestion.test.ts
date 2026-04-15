import { describe, expect, it } from "vitest"
import { checkTraceIngestionRateLimit, type TraceIngestionRateLimitRedis } from "./trace-ingestion.ts"

type PipelineCommand =
  | { readonly type: "incr"; readonly key: string }
  | { readonly type: "incrby"; readonly key: string; readonly increment: number }
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
  projectId: "project-1",
  apiKeyId: "key-1",
  payloadBytes,
  config: testConfig,
})

describe("checkTraceIngestionRateLimit", () => {
  it("allows requests within the configured request and byte limits", async () => {
    const redis = new FakeRedis()

    const result = await checkTraceIngestionRateLimit(createInput(redis, 40))

    expect(result).toEqual({ allowed: true })
  })

  it("blocks when the request count exceeds the configured limit", async () => {
    const redis = new FakeRedis()

    await checkTraceIngestionRateLimit(createInput(redis, 10))
    await checkTraceIngestionRateLimit(createInput(redis, 10))
    const result = await checkTraceIngestionRateLimit(createInput(redis, 10))

    expect(result).toEqual({
      allowed: false,
      limitedBy: "requests",
      retryAfterSeconds: 30,
    })
  })

  it("blocks when the total ingested bytes exceed the configured limit", async () => {
    const redis = new FakeRedis()

    await checkTraceIngestionRateLimit(createInput(redis, 60))
    const result = await checkTraceIngestionRateLimit(createInput(redis, 60))

    expect(result).toEqual({
      allowed: false,
      limitedBy: "bytes",
      retryAfterSeconds: 30,
    })
  })

  it("fails open when redis is unavailable", async () => {
    const result = await checkTraceIngestionRateLimit(createInput(new ThrowingRedis(), 60))

    expect(result).toEqual({ allowed: true })
  })
})
