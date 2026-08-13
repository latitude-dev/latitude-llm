import { RateLimitError } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { enforceExportRequestRateLimit } from "./export-rate-limit.ts"
import type { RedisClient } from "./index.ts"

class FakeRedis {
  readonly status = "ready"
  readonly counts = new Map<string, number>()
  readonly ttls = new Map<string, number>()
  keys: string[] = []

  pipeline() {
    const commands: Array<"incr" | "ttl"> = []
    let key = ""

    return {
      incr: (nextKey: string) => {
        key = nextKey
        commands.push("incr")
      },
      ttl: (nextKey: string) => {
        key = nextKey
        commands.push("ttl")
      },
      exec: async () => {
        this.keys.push(key)
        return commands.map((command) => {
          if (command === "incr") {
            const count = (this.counts.get(key) ?? 0) + 1
            this.counts.set(key, count)
            return [null, count] as [null, number]
          }

          return [null, this.ttls.get(key) ?? -2] as [null, number]
        })
      },
    }
  }

  async expire(key: string, seconds: number) {
    this.ttls.set(key, seconds)
    return 1
  }
}

describe("enforceExportRequestRateLimit", () => {
  it("uses an organization-prefixed normalized key and rejects requests after the window quota", async () => {
    const redis = new FakeRedis()
    const input = {
      redis: redis as unknown as RedisClient,
      organizationId: "org_123",
      projectId: "proj_456",
      recipientEmail: "Owner@Example.COM",
    }

    for (let i = 0; i < 30; i += 1) {
      await expect(enforceExportRequestRateLimit(input)).resolves.toBeUndefined()
    }

    await expect(enforceExportRequestRateLimit(input)).rejects.toBeInstanceOf(RateLimitError)
    expect(redis.keys).toEqual(
      Array.from({ length: 31 }, () => "org:org_123:export:rate_limit:proj_456:owner@example.com"),
    )
  })

  it("fails open when Redis is not ready", async () => {
    const redis = {
      status: "end",
      off: () => {},
      once: (event: string, callback: () => void) => {
        if (event === "close") queueMicrotask(callback)
      },
    } as unknown as RedisClient

    await expect(
      enforceExportRequestRateLimit({
        redis,
        organizationId: "org_123",
        projectId: "proj_456",
        recipientEmail: "owner@example.com",
      }),
    ).resolves.toBeUndefined()
  })
})
