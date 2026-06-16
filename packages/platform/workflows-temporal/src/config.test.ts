import { describe, expect, it, vi, afterEach } from "vitest"
import { loadTemporalConfig } from "./config.ts"

const stubRequiredTemporalEnv = () => {
  vi.stubEnv("LAT_TEMPORAL_ADDRESS", "127.0.0.1:7233")
  vi.stubEnv("LAT_TEMPORAL_NAMESPACE", "default")
  vi.stubEnv("LAT_TEMPORAL_TASK_QUEUE", "workflows")
}

describe("loadTemporalConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("loads optional worker activity concurrency", () => {
    stubRequiredTemporalEnv()
    vi.stubEnv("LAT_TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASKS", "4")

    expect(loadTemporalConfig()).toMatchObject({
      address: "127.0.0.1:7233",
      namespace: "default",
      taskQueue: "workflows",
      maxConcurrentActivityTaskExecutions: 4,
    })
  })

  it("rejects non-positive worker activity concurrency", () => {
    stubRequiredTemporalEnv()
    vi.stubEnv("LAT_TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASKS", "0")

    expect(() => loadTemporalConfig()).toThrow(
      "Invalid environment variable: LAT_TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASKS=0 (expected number)",
    )
  })
})
