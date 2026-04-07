import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import { checkRedisHealth } from "./health.ts"

describe("checkRedisHealth", () => {
  it("returns skipped when connection is closed", async () => {
    const client = {
      status: "close",
      ping: vi.fn(),
    } as unknown as Redis
    const report = await checkRedisHealth(client)
    expect(report).toEqual({
      status: "close",
      ping: "skipped",
      error: "connection closed",
    })
    expect(client.ping).not.toHaveBeenCalled()
  })

  it("returns ok when ping returns PONG", async () => {
    const client = {
      status: "ready",
      ping: vi.fn().mockResolvedValue("PONG"),
    } as unknown as Redis
    const report = await checkRedisHealth(client)
    expect(report).toEqual({ status: "ready", ping: "ok" })
  })

  it("returns error when ping fails", async () => {
    const client = {
      status: "ready",
      ping: vi.fn().mockRejectedValue(new Error("timeout")),
    } as unknown as Redis
    const report = await checkRedisHealth(client)
    expect(report.status).toBe("ready")
    expect(report.ping).toBe("error")
    expect(report.error).toBe("timeout")
  })
})
