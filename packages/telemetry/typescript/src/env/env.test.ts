import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getExporterUrl } from "./env.ts"

const ENV_KEYS = ["LATITUDE_TELEMETRY_URL", "NODE_ENV"] as const

describe("getExporterUrl", () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const previous = originalEnv[key]
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    }
  })

  it("returns LATITUDE_TELEMETRY_URL when set, regardless of NODE_ENV", () => {
    process.env.LATITUDE_TELEMETRY_URL = "https://custom.example.com"
    process.env.NODE_ENV = "development"
    expect(getExporterUrl()).toBe("https://custom.example.com")
  })

  it("returns localhost when NODE_ENV is development", () => {
    process.env.NODE_ENV = "development"
    expect(getExporterUrl()).toBe("http://localhost:3002")
  })

  it("returns localhost when NODE_ENV is test", () => {
    process.env.NODE_ENV = "test"
    expect(getExporterUrl()).toBe("http://localhost:3002")
  })

  it("returns production ingest when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production"
    expect(getExporterUrl()).toBe("https://ingest.latitude.so")
  })

  it("returns production ingest when NODE_ENV is unset", () => {
    expect(getExporterUrl()).toBe("https://ingest.latitude.so")
  })

  it("returns production ingest for unknown NODE_ENV values like staging", () => {
    process.env.NODE_ENV = "staging"
    expect(getExporterUrl()).toBe("https://ingest.latitude.so")
  })
})
