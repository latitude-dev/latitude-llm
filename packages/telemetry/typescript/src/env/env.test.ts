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

  it("returns LATITUDE_TELEMETRY_URL when set", () => {
    process.env.LATITUDE_TELEMETRY_URL = "https://custom.example.com"
    expect(getExporterUrl()).toBe("https://custom.example.com")
  })

  it("ignores NODE_ENV and returns production ingest by default", () => {
    process.env.NODE_ENV = "development"
    expect(getExporterUrl()).toBe("https://ingest.latitude.so")
  })

  it("returns production ingest when no env vars are set", () => {
    expect(getExporterUrl()).toBe("https://ingest.latitude.so")
  })
})
