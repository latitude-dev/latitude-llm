import { beforeEach, describe, expect, it, vi } from "vitest"

const redisConstructor = vi.fn()

vi.mock("ioredis", () => ({
  Redis: redisConstructor,
}))

describe("createRedisClient", () => {
  beforeEach(() => {
    redisConstructor.mockReset()
    redisConstructor.mockImplementation(function (this: { options?: unknown }, options) {
      this.options = options
    })
  })

  it("creates a fail-fast client configuration", async () => {
    const { createRedisClient } = await import("./client.ts")

    const client = createRedisClient({
      host: "localhost",
      port: 6379,
    })

    expect(redisConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "localhost",
        port: 6379,
        db: 0,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        commandTimeout: 5000,
        maxRetriesPerRequest: 1,
      }),
    )
    expect(client).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({
          host: "localhost",
          port: 6379,
        }),
      }),
    )
  })

  it("enables TLS when requested by the connection", async () => {
    const { createRedisClient } = await import("./client.ts")

    createRedisClient({
      host: "memorydb.example.com",
      port: 6379,
      tls: true,
    })

    expect(redisConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "memorydb.example.com",
        port: 6379,
        tls: {},
      }),
    )
  })
})
