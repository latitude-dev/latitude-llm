import { createHash } from "node:crypto"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PostHogClientShape } from "../client.ts"
import { isOssTelemetryEnabled, loadOssTelemetryConfig } from "./config.ts"
import {
  BUNDLED_OSS_TELEMETRY_POSTHOG_API_KEY,
  OSS_TELEMETRY_EVENT,
  OSS_TELEMETRY_POSTHOG_HOST,
  ossTelemetryHeartbeatKey,
} from "./constants.ts"
import { deriveDeploymentId } from "./deployment-id.ts"
import { reportOssDeploymentHeartbeat } from "./report.ts"

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

  it("uses the bundled PostHog key in production", () => {
    process.env.NODE_ENV = "production"
    expect(Effect.runSync(loadOssTelemetryConfig)).toEqual({
      apiKey: BUNDLED_OSS_TELEMETRY_POSTHOG_API_KEY,
      host: OSS_TELEMETRY_POSTHOG_HOST,
    })
  })

  it("lets LAT_OSS_TELEMETRY_POSTHOG_API_KEY override the bundled key", () => {
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
  it("builds a heartbeat key that the Redis client prefixes with latitude:", () => {
    expect(ossTelemetryHeartbeatKey("abc123")).toBe("oss-telemetry:heartbeat:abc123")
  })
})

describe("reportOssDeploymentHeartbeat", () => {
  const authSecret = "oss-telemetry-test-secret"
  const deploymentId = createHash("sha256").update(authSecret).digest("hex").slice(0, 32)

  const createFakePosthog = () => {
    const captures: Array<{
      distinctId: string
      event: string
      properties?: Record<string, unknown>
    }> = []
    const client: PostHogClientShape = {
      capture: async (input) => {
        captures.push(input)
      },
      groupIdentify: async () => undefined,
      personIdentify: async () => undefined,
      shutdown: vi.fn(async () => undefined),
    }
    return { client, captures }
  }

  const createFakeRedis = () => {
    const keys = new Set<string>()
    return {
      keys,
      redis: {
        async set(key: string, _value: string, _mode: "EX", _ttl: number, _nx: "NX") {
          if (keys.has(key)) return null
          keys.add(key)
          return "OK"
        },
      },
    }
  }

  afterEach(() => {
    delete process.env.LAT_OSS_TELEMETRY_ENABLED
    delete process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY
    delete process.env.LAT_OSS_TELEMETRY_POSTHOG_HOST
    delete process.env.LAT_BETTER_AUTH_SECRET
    delete process.env.LAT_WEB_URL
    delete process.env.LAT_IMAGE_TAG
    delete process.env.DD_VERSION
    delete process.env.DD_GIT_COMMIT_SHA
    delete process.env.NODE_ENV
  })

  it("no-ops when telemetry is disabled", async () => {
    process.env.NODE_ENV = "development"
    const { client, captures } = createFakePosthog()

    await reportOssDeploymentHeartbeat({ serviceName: "api", posthog: client })

    expect(captures).toHaveLength(0)
    expect(client.shutdown).not.toHaveBeenCalled()
  })

  it("no-ops when the auth secret is missing", async () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_test_key"
    const { client, captures } = createFakePosthog()

    await reportOssDeploymentHeartbeat({ serviceName: "api", posthog: client })

    expect(captures).toHaveLength(0)
  })

  it("captures a heartbeat with coarse deployment metadata", async () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_test_key"
    process.env.LAT_BETTER_AUTH_SECRET = authSecret
    process.env.LAT_WEB_URL = "https://latitude.example.com"
    process.env.LAT_IMAGE_TAG = "1.2.3"
    const { client, captures } = createFakePosthog()

    await reportOssDeploymentHeartbeat({ serviceName: "api", posthog: client })

    expect(captures).toEqual([
      {
        distinctId: `deployment_${deploymentId}`,
        event: OSS_TELEMETRY_EVENT,
        properties: {
          $process_person_profile: false,
          deploymentId,
          service: "api",
          nodeVersion: process.version,
          version: "1.2.3",
          webHost: "latitude.example.com",
        },
      },
    ])
    expect(client.shutdown).toHaveBeenCalledOnce()
  })

  it("dedupes via Redis SET NX so restarts within the TTL do not re-send", async () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_test_key"
    process.env.LAT_BETTER_AUTH_SECRET = authSecret
    const { client, captures } = createFakePosthog()
    const { redis } = createFakeRedis()

    await reportOssDeploymentHeartbeat({ serviceName: "api", redis, posthog: client })
    await reportOssDeploymentHeartbeat({ serviceName: "api", redis, posthog: client })

    expect(captures).toHaveLength(1)
    expect(client.shutdown).toHaveBeenCalledOnce()
  })

  it("swallows Redis failures so startup is never blocked", async () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_test_key"
    process.env.LAT_BETTER_AUTH_SECRET = authSecret
    const { client, captures } = createFakePosthog()

    await expect(
      reportOssDeploymentHeartbeat({
        serviceName: "api",
        redis: {
          set: async () => {
            throw new Error("redis unavailable")
          },
        },
        posthog: client,
      }),
    ).resolves.toBeUndefined()

    expect(captures).toHaveLength(0)
  })

  it("swallows PostHog capture failures so startup is never blocked", async () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_test_key"
    process.env.LAT_BETTER_AUTH_SECRET = authSecret
    const client: PostHogClientShape = {
      capture: async () => {
        throw new Error("posthog down")
      },
      groupIdentify: async () => undefined,
      personIdentify: async () => undefined,
      shutdown: async () => undefined,
    }

    await expect(reportOssDeploymentHeartbeat({ serviceName: "api", posthog: client })).resolves.toBeUndefined()
  })

  it("prefers LAT_IMAGE_TAG over Datadog version env vars", async () => {
    process.env.NODE_ENV = "production"
    process.env.LAT_OSS_TELEMETRY_POSTHOG_API_KEY = "phc_test_key"
    process.env.LAT_BETTER_AUTH_SECRET = authSecret
    process.env.LAT_IMAGE_TAG = "2.0.0"
    process.env.DD_VERSION = "deadbeef"
    const { client, captures } = createFakePosthog()

    await reportOssDeploymentHeartbeat({ serviceName: "api", posthog: client })

    expect(captures[0]?.properties?.version).toBe("2.0.0")
  })
})
