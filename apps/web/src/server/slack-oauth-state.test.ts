import { OrganizationId, UserId } from "@domain/shared"
import { beforeEach, describe, expect, it } from "vitest"
import {
  consumeSlackOAuthState,
  generateSlackOAuthState,
  type SlackOAuthStatePipeline,
  type SlackOAuthStateRedis,
} from "./slack-oauth-state.ts"

class FakeRedisPipeline implements SlackOAuthStatePipeline {
  private readonly ops: Array<{ readonly kind: "get" | "del"; readonly key: string }> = []

  constructor(private readonly redis: FakeRedis) {}

  get(key: string): SlackOAuthStatePipeline {
    this.ops.push({ kind: "get", key })
    return this
  }

  del(key: string): SlackOAuthStatePipeline {
    this.ops.push({ kind: "del", key })
    return this
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    return this.ops.map((op) => {
      if (op.kind === "get") return [null, this.redis.getValue(op.key)] as [Error | null, unknown]
      this.redis.deleteValue(op.key)
      return [null, 1]
    })
  }
}

class FakeRedis implements SlackOAuthStateRedis {
  private readonly values = new Map<string, string>()

  async set(key: string, value: string, _mode: "EX", _ttlSeconds: number): Promise<"OK"> {
    this.values.set(key, value)
    return "OK"
  }

  pipeline(): SlackOAuthStatePipeline {
    return new FakeRedisPipeline(this)
  }

  getValue(key: string): string | null {
    return this.values.get(key) ?? null
  }

  deleteValue(key: string): void {
    this.values.delete(key)
  }

  size(): number {
    return this.values.size
  }
}

class ThrowingPipelineRedis implements SlackOAuthStateRedis {
  async set(): Promise<"OK"> {
    return "OK"
  }
  pipeline(): SlackOAuthStatePipeline {
    return {
      get() {
        return this
      },
      del() {
        return this
      },
      async exec(): Promise<Array<[Error | null, unknown]>> {
        throw new Error("redis unavailable")
      },
    }
  }
}

const ORG_A = OrganizationId("a".repeat(24))
const USER_A = UserId("u".repeat(24))

describe("generateSlackOAuthState + consumeSlackOAuthState", () => {
  let redis: FakeRedis

  beforeEach(() => {
    redis = new FakeRedis()
  })

  it("produces a 64-character hex state token (32 random bytes)", async () => {
    const state = await generateSlackOAuthState({ redis, organizationId: ORG_A, userId: USER_A })
    expect(state).toMatch(/^[0-9a-f]{64}$/)
  })

  it("round-trips the payload through generate → consume", async () => {
    const state = await generateSlackOAuthState({ redis, organizationId: ORG_A, userId: USER_A })

    const payload = await consumeSlackOAuthState({ redis, state })

    expect(payload).not.toBeNull()
    expect(payload?.organizationId).toBe(ORG_A)
    expect(payload?.userId).toBe(USER_A)
    expect(payload?.createdAt).toBeInstanceOf(Date)
  })

  it("deletes the key after a successful consume (single-use)", async () => {
    const state = await generateSlackOAuthState({ redis, organizationId: ORG_A, userId: USER_A })

    await consumeSlackOAuthState({ redis, state })
    const second = await consumeSlackOAuthState({ redis, state })

    expect(second).toBeNull()
    expect(redis.size()).toBe(0)
  })

  it("returns null for a state token that was never written", async () => {
    const payload = await consumeSlackOAuthState({ redis, state: "0".repeat(64) })
    expect(payload).toBeNull()
  })

  it("returns null when the payload is malformed JSON", async () => {
    await redis.set("slack:oauth-state:bad", "not json", "EX", 600)
    const payload = await consumeSlackOAuthState({ redis, state: "bad" })
    expect(payload).toBeNull()
  })

  it("returns null when the payload fails schema validation", async () => {
    await redis.set("slack:oauth-state:missing-fields", JSON.stringify({ organizationId: "x" }), "EX", 600)
    const payload = await consumeSlackOAuthState({ redis, state: "missing-fields" })
    expect(payload).toBeNull()
  })

  it("returns null when the Redis pipeline throws (fail-closed)", async () => {
    const throwingRedis = new ThrowingPipelineRedis()
    const payload = await consumeSlackOAuthState({ redis: throwingRedis, state: "anything" })
    expect(payload).toBeNull()
  })
})
