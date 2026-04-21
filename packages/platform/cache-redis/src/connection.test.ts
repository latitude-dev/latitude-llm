import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRedisConnectionEffect } from "./connection.ts"

const ENV_KEYS = ["LAT_REDIS_HOST", "LAT_REDIS_PORT", "LAT_REDIS_TLS", "LAT_REDIS_CLUSTER"]

const BASE_ENV: Record<string, string> = {
  LAT_REDIS_HOST: "localhost",
  LAT_REDIS_PORT: "6379",
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

describe("createRedisConnectionEffect", () => {
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

  it("loads valid config with TLS omitted by default", async () => {
    setEnv(BASE_ENV)
    const config = await Effect.runPromise(createRedisConnectionEffect())

    expect(config).toEqual({
      host: "localhost",
      port: 6379,
    })
  })

  it("loads config with TLS enabled", async () => {
    setEnv({ ...BASE_ENV, LAT_REDIS_TLS: "true" })
    const config = await Effect.runPromise(createRedisConnectionEffect())

    expect(config).toEqual({
      host: "localhost",
      port: 6379,
      tls: true,
    })
  })

  it("omits TLS when LAT_REDIS_TLS is not 'true'", async () => {
    setEnv({ ...BASE_ENV, LAT_REDIS_TLS: "false" })
    const config = await Effect.runPromise(createRedisConnectionEffect())

    expect(config.tls).toBeUndefined()
  })

  it("enables cluster mode when LAT_REDIS_CLUSTER is true", async () => {
    setEnv({ ...BASE_ENV, LAT_REDIS_CLUSTER: "true" })
    const config = await Effect.runPromise(createRedisConnectionEffect())

    expect(config).toEqual({
      host: "localhost",
      port: 6379,
      cluster: true,
    })
  })

  it("omits cluster mode when LAT_REDIS_CLUSTER is not set", async () => {
    setEnv(BASE_ENV)
    const config = await Effect.runPromise(createRedisConnectionEffect())

    expect(config.cluster).toBeUndefined()
  })

  it("fails when host is missing", async () => {
    clearEnv()
    await expect(Effect.runPromise(createRedisConnectionEffect())).rejects.toThrow()
  })
})
