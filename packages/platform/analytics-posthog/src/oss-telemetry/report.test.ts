import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { isOssTelemetryEnabled, loadOssTelemetryConfig } from "./config.ts"
import { ossTelemetryHeartbeatKey } from "./constants.ts"
import { deriveDeploymentId } from "./deployment-id.ts"

describe("deriveDeploymentId", () => {
  afterEach(() => {
    delete process.env.LAT_BETTER_AUTH_SECRET
  })

  it("returns a stable hash of LAT_BETTER_AUTH_SECRET", () => {
    process.env.LAT_BETTER_AUTH_SECRET = "test-secret"
    const first = deriveDeploymentId()
    const second = deriveDeploymentId()
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{32}$/)
  })

  it("returns undefined when LAT_BETTER_AUTH_SECRET is unset", () => {
    expect(deriveDeploymentId()).toBeUndefined()
  })
})

describe("isOssTelemetryEnabled", () => {
  afterEach(() => {
    delete process.env.LAT_OSS_TELEMETRY_ENABLED
    delete process.env.NODE_ENV
  })

  it("defaults to true in production", () => {
    process.env.NODE_ENV = "production"
    expect(isOssTelemetryEnabled()).toBe(true)
  })

  it("defaults to false outside production", () => {
    process.env.NODE_ENV = "development"
    expect(isOssTelemetryEnabled()).toBe(false)
  })

  it("honors LAT_OSS_TELEMETRY_ENABLED=false", () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_ENABLED = "false"
    expect(isOssTelemetryEnabled()).toBe(false)
  })

  it("honors LAT_OSS_TELEMETRY_ENABLED=true outside production", () => {
    process.env.NODE_ENV = "development"
    process.env.LAT_OSS_TELEMETRY_ENABLED = "true"
    expect(isOssTelemetryEnabled()).toBe(true)
  })
})

describe("loadOssTelemetryConfig", () => {
  afterEach(() => {
    delete process.env.LAT_OSS_TELEMETRY_ENABLED
    delete process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY
    delete process.env.LAT_OSS_TELEMETRY_POSTHOG_HOST
    delete process.env.NODE_ENV
  })

  it("returns undefined when telemetry is disabled", () => {
    process.env.NODE_ENV = "development"
    expect(Effect.runSync(loadOssTelemetryConfig)).toBeUndefined()
  })

  it("returns undefined in production until a bundled or env PostHog key is configured", () => {
    process.env.NODE_ENV = "production"
    expect(Effect.runSync(loadOssTelemetryConfig)).toBeUndefined()
  })

  it("returns config when enabled and a PostHog key is configured", () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_test_key"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_HOST = "https://eu.i.posthog.com"

    expect(Effect.runSync(loadOssTelemetryConfig)).toEqual({
      apiKey: "phc_test_key",
      host: "https://eu.i.posthog.com",
    })
  })
})

describe("ossTelemetryHeartbeatKey", () => {
  it("namespaces heartbeat keys under latitude:", () => {
    expect(ossTelemetryHeartbeatKey("abc123")).toBe("oss-telemetry:heartbeat:abc123")
  })
})
