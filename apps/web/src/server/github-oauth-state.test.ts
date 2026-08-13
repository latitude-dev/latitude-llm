import { OrganizationId, UserId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  consumeGithubInstallState,
  type GithubInstallStateRedis,
  generateGithubInstallState,
} from "./github-oauth-state.ts"

const createFakeRedis = (): GithubInstallStateRedis & { store: Map<string, string> } => {
  const store = new Map<string, string>()
  return {
    store,
    set: async (key, value) => {
      store.set(key, value)
      return "OK"
    },
    getdel: async (key) => {
      const value = store.get(key) ?? null
      store.delete(key)
      return value
    },
  }
}

const ORG = OrganizationId("a".repeat(24))
const USER = UserId("d".repeat(24))

describe("github install state", () => {
  it("round-trips organization + user through a generated nonce", async () => {
    const redis = createFakeRedis()
    const state = await generateGithubInstallState({ redis, organizationId: ORG, userId: USER })
    expect(state).toMatch(/^[0-9a-f]{64}$/)

    const entry = await consumeGithubInstallState({ redis, state })
    expect(entry?.organizationId).toBe(ORG)
    expect(entry?.userId).toBe(USER)
  })

  it("is single-use — a second consume returns null (replay defense)", async () => {
    const redis = createFakeRedis()
    const state = await generateGithubInstallState({ redis, organizationId: ORG, userId: USER })

    expect(await consumeGithubInstallState({ redis, state })).not.toBeNull()
    expect(await consumeGithubInstallState({ redis, state })).toBeNull()
  })

  it("returns null for an unknown / mismatched state", async () => {
    const redis = createFakeRedis()
    expect(await consumeGithubInstallState({ redis, state: "never-issued" })).toBeNull()
  })

  it("returns null for a malformed stored payload", async () => {
    const redis = createFakeRedis()
    redis.store.set("github:install-state:corrupt", "not-json")
    expect(await consumeGithubInstallState({ redis, state: "corrupt" })).toBeNull()
  })
})
