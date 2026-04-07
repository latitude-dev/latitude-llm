import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import { closeRedis } from "./lifecycle.ts"

describe("closeRedis", () => {
  it("returns immediately when status is end", async () => {
    const client = { status: "end", quit: vi.fn(), disconnect: vi.fn() } as unknown as Redis
    await closeRedis(client)
    expect(client.quit).not.toHaveBeenCalled()
    expect(client.disconnect).not.toHaveBeenCalled()
  })

  it("calls quit when connected", async () => {
    const quit = vi.fn().mockResolvedValue("OK")
    const disconnect = vi.fn()
    const client = { status: "ready", quit, disconnect } as unknown as Redis
    await closeRedis(client)
    expect(quit).toHaveBeenCalledOnce()
    expect(disconnect).not.toHaveBeenCalled()
  })

  it("disconnects when quit throws", async () => {
    const quit = vi.fn().mockRejectedValue(new Error("network"))
    const disconnect = vi.fn()
    const client = { status: "ready", quit, disconnect } as unknown as Redis
    await closeRedis(client)
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
