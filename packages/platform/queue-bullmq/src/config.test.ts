import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadBullMqConfig } from "./config.ts"

const ENV_KEYS = ["LAT_BULLMQ_HOST", "LAT_BULLMQ_PORT", "LAT_BULLMQ_PASSWORD", "LAT_REDIS_TLS"]

const BASE_ENV: Record<string, string> = {
  LAT_BULLMQ_HOST: "localhost",
  LAT_BULLMQ_PORT: "6379",
}

const originalEnv: Record<string, string | undefined> = {}

function setEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) {
    process.env[k] = v
  }
}

function clearEnv() {
  for (const k of ENV_KEYS) {
    delete process.env[k]
  }
}

describe("loadBullMqConfig", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      originalEnv[k] = process.env[k]
    }
  })

  afterEach(() => {
    clearEnv()
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v !== undefined) {
        process.env[k] = v
      }
    }
  })

  it("loads valid config with defaults", async () => {
    setEnv(BASE_ENV)
    const config = await Effect.runPromise(loadBullMqConfig())

    expect(config.host).toBe("localhost")
    expect(config.port).toBe(6379)
    expect(config.password).toBeUndefined()
    expect(config.tls).toBeUndefined()
  })

  it("loads config with optional password", async () => {
    setEnv({ ...BASE_ENV, LAT_BULLMQ_PASSWORD: "secret" })
    const config = await Effect.runPromise(loadBullMqConfig())

    expect(config.password).toBe("secret")
  })

  it("uses default port when not specified", async () => {
    setEnv({ LAT_BULLMQ_HOST: "redis.example.com" })
    const config = await Effect.runPromise(loadBullMqConfig())

    expect(config.port).toBe(6380)
  })

  it("loads config with TLS enabled", async () => {
    setEnv({ ...BASE_ENV, LAT_REDIS_TLS: "true" })
    const config = await Effect.runPromise(loadBullMqConfig())

    expect(config.tls).toBe(true)
  })

  it("omits tls when LAT_REDIS_TLS is not 'true'", async () => {
    setEnv({ ...BASE_ENV, LAT_REDIS_TLS: "false" })
    const config = await Effect.runPromise(loadBullMqConfig())

    expect(config.tls).toBeUndefined()
  })

  it("fails when host is missing", async () => {
    clearEnv()
    await expect(Effect.runPromise(loadBullMqConfig())).rejects.toThrow()
  })
})
