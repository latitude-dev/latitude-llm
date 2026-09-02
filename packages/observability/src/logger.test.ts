import { afterEach, describe, expect, it, vi } from "vitest"
import { emitLog } from "./logger.ts"
import type { ObservabilityState } from "./types.ts"

const state: ObservabilityState = {
  initialized: true,
  enabled: true,
  serviceName: "test",
  environment: "test",
}

describe("emitLog", () => {
  afterEach(() => {
    delete process.env.LAT_LOG_LEVEL
    vi.restoreAllMocks()
  })

  it("writes info when LAT_LOG_LEVEL is unset", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    emitLog(state, "info", "test", ["hello"])
    expect(log).toHaveBeenCalledOnce()
  })

  it("drops info when LAT_LOG_LEVEL is warn", () => {
    process.env.LAT_LOG_LEVEL = "warn"
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    emitLog(state, "info", "test", ["hello"])
    expect(log).not.toHaveBeenCalled()
  })

  it("writes warn and error when LAT_LOG_LEVEL is warn", () => {
    process.env.LAT_LOG_LEVEL = "warn"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    emitLog(state, "warn", "test", ["careful"])
    emitLog(state, "error", "test", ["boom"])
    expect(warn).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
  })

  it("drops warn when LAT_LOG_LEVEL is error", () => {
    process.env.LAT_LOG_LEVEL = "error"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    emitLog(state, "warn", "test", ["careful"])
    emitLog(state, "error", "test", ["boom"])
    expect(warn).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledOnce()
  })
})
