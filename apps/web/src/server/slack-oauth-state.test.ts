import { OrganizationId, UserId } from "@domain/shared"
import { beforeEach, describe, expect, it } from "vitest"
import {
  consumeSlackOAuthState,
  generateSlackOAuthState,
  type SlackOAuthStateRedis,
  validateReturnTo,
} from "./slack-oauth-state.ts"

class FakeRedis implements SlackOAuthStateRedis {
  private readonly values = new Map<string, string>()

  async set(key: string, value: string, _mode: "EX", _ttlSeconds: number): Promise<"OK"> {
    this.values.set(key, value)
    return "OK"
  }

  async getdel(key: string): Promise<string | null> {
    const value = this.values.get(key)
    if (value === undefined) return null
    this.values.delete(key)
    return value
  }

  size(): number {
    return this.values.size
  }
}

class ThrowingRedis implements SlackOAuthStateRedis {
  async set(): Promise<"OK"> {
    return "OK"
  }
  async getdel(): Promise<string | null> {
    throw new Error("redis unavailable")
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

  it("returns null when the Redis getdel throws (fail-closed)", async () => {
    const throwingRedis = new ThrowingRedis()
    const payload = await consumeSlackOAuthState({ redis: throwingRedis, state: "anything" })
    expect(payload).toBeNull()
  })

  // The atomicity guarantee comes from Redis `GETDEL` itself. We can't
  // race in-process against a Map, so the most we can verify here is
  // that concurrent consumers contend on the same key and only one
  // sees the payload.
  it("only one of two concurrent consumers receives the payload", async () => {
    const state = await generateSlackOAuthState({ redis, organizationId: ORG_A, userId: USER_A })

    const [a, b] = await Promise.all([
      consumeSlackOAuthState({ redis, state }),
      consumeSlackOAuthState({ redis, state }),
    ])

    const winners = [a, b].filter((result) => result !== null)
    expect(winners).toHaveLength(1)
    expect(redis.size()).toBe(0)
  })

  it("round-trips a valid returnTo through generate → consume", async () => {
    const state = await generateSlackOAuthState({
      redis,
      organizationId: ORG_A,
      userId: USER_A,
      returnTo: "/projects/acme/onboarding",
    })

    const payload = await consumeSlackOAuthState({ redis, state })
    expect(payload?.returnTo).toBe("/projects/acme/onboarding")
  })

  it("returns returnTo=null when caller passes nothing", async () => {
    const state = await generateSlackOAuthState({ redis, organizationId: ORG_A, userId: USER_A })

    const payload = await consumeSlackOAuthState({ redis, state })
    expect(payload?.returnTo).toBeNull()
  })

  it("drops an invalid returnTo at generate time (stored as null)", async () => {
    const state = await generateSlackOAuthState({
      redis,
      organizationId: ORG_A,
      userId: USER_A,
      returnTo: "//evil.com/path",
    })

    const payload = await consumeSlackOAuthState({ redis, state })
    expect(payload?.returnTo).toBeNull()
  })

  it("drops a tampered returnTo at consume time", async () => {
    // Simulate a record that bypassed `generateSlackOAuthState` and
    // wrote a bad returnTo directly.
    await redis.set(
      "slack:oauth-state:tampered",
      JSON.stringify({
        organizationId: ORG_A,
        userId: USER_A,
        createdAt: new Date().toISOString(),
        returnTo: "https://evil.com",
      }),
      "EX",
      600,
    )

    const payload = await consumeSlackOAuthState({ redis, state: "tampered" })
    expect(payload).not.toBeNull()
    expect(payload?.returnTo).toBeNull()
  })
})

describe("validateReturnTo", () => {
  it("accepts a path under /projects/", () => {
    expect(validateReturnTo("/projects/acme/onboarding")).toBe("/projects/acme/onboarding")
  })

  it("accepts a /projects/ path with query string", () => {
    expect(validateReturnTo("/projects/acme/onboarding?step=slack")).toBe("/projects/acme/onboarding?step=slack")
  })

  it.each([
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["non-string number", 42 as unknown as string],
    ["protocol-relative", "//evil.com"],
    ["backslash-escape", "/\\evil.com"],
    ["absolute URL", "https://evil.com"],
    ["relative path", "projects/acme/onboarding"],
    ["unrelated path", "/settings/integrations"],
    ["root", "/"],
    ["contains newline", "/projects/acme/\nonboarding"],
    ["contains null byte", "/projects/acme/\x00onboarding"],
    ["contains fragment", "/projects/acme/onboarding#section"],
    ["exceeds length cap", `/projects/${"a".repeat(600)}`],
  ])("rejects %s", (_label, input) => {
    expect(validateReturnTo(input as string | null | undefined)).toBeNull()
  })
})
