import { beforeEach, describe, expect, it, vi } from "vitest"

const clusterConstructor = vi.fn()
const redisConstructor = vi.fn()

vi.mock("ioredis", () => ({
  Cluster: clusterConstructor,
  Redis: redisConstructor,
}))

describe("createBullMqRedisConnection", () => {
  beforeEach(() => {
    clusterConstructor.mockReset()
    redisConstructor.mockReset()

    clusterConstructor.mockImplementation(function (
      this: { startupNodes?: unknown; options?: unknown },
      startupNodes,
      options,
    ) {
      this.startupNodes = startupNodes
      this.options = options
    })
    redisConstructor.mockImplementation(function (this: { options?: unknown }, options) {
      this.options = options
    })
  })

  it("creates a single-node Redis connection by default", async () => {
    const { createBullMqRedisConnection } = await import("./connection.ts")

    const connection = createBullMqRedisConnection({
      host: "localhost",
      port: 6379,
    })

    expect(redisConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: null,
      }),
    )
    expect(clusterConstructor).not.toHaveBeenCalled()
    expect(connection).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({
          host: "localhost",
          port: 6379,
        }),
      }),
    )
  })

  it("creates a Redis Cluster connection when cluster mode is enabled", async () => {
    const { createBullMqRedisConnection } = await import("./connection.ts")

    const connection = createBullMqRedisConnection({
      host: "memorydb.example.com",
      port: 6379,
      tls: true,
      cluster: true,
    })

    expect(clusterConstructor).toHaveBeenCalledWith([{ host: "memorydb.example.com", port: 6379 }], {
      redisOptions: expect.objectContaining({
        host: "memorydb.example.com",
        port: 6379,
        tls: {},
        maxRetriesPerRequest: null,
      }),
    })
    expect(redisConstructor).not.toHaveBeenCalled()
    expect(connection).toEqual(
      expect.objectContaining({
        startupNodes: [{ host: "memorydb.example.com", port: 6379 }],
      }),
    )
  })
})
