import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"

const redisConstructor = vi.fn()
const clusterConstructor = vi.fn()

vi.mock("ioredis", () => ({
  Redis: redisConstructor,
  Cluster: clusterConstructor,
}))

describe("createRedisClient", () => {
  beforeEach(() => {
    redisConstructor.mockReset()
    clusterConstructor.mockReset()
    redisConstructor.mockImplementation(function (this: { options?: unknown }, options) {
      this.options = options
    })
    clusterConstructor.mockImplementation(function (
      this: { nodes?: unknown; options?: unknown },
      nodes: unknown,
      options: unknown,
    ) {
      this.nodes = nodes
      this.options = options
    })
  })

  it("creates a single-node Redis client by default", async () => {
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
    expect(clusterConstructor).not.toHaveBeenCalled()
    expect(client).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({
          host: "localhost",
          port: 6379,
        }),
      }),
    )
  })

  it("creates a Cluster client when cluster mode is enabled", async () => {
    const { createRedisClient } = await import("./client.ts")

    createRedisClient({
      host: "memorydb.example.com",
      port: 6379,
      cluster: true,
    })

    expect(clusterConstructor).toHaveBeenCalledWith(
      [{ host: "memorydb.example.com", port: 6379 }],
      expect.objectContaining({
        enableOfflineQueue: true,
        redisOptions: expect.objectContaining({
          host: "memorydb.example.com",
          port: 6379,
          connectTimeout: 5000,
          commandTimeout: 5000,
          maxRetriesPerRequest: null,
        }),
        dnsLookup: expect.any(Function),
      }),
    )
    expect(redisConstructor).not.toHaveBeenCalled()
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

  it("waits for a cold client to become ready", async () => {
    const { waitForRedisClientReady } = await import("./client.ts")

    class FakeRedisClient extends EventEmitter {
      status = "wait"
      connect = vi.fn(async () => {
        this.status = "ready"
        queueMicrotask(() => this.emit("ready"))
      })
    }

    const client = new FakeRedisClient()

    await expect(waitForRedisClientReady(client as never)).resolves.toBe(client)
    expect(client.connect).toHaveBeenCalledTimes(1)
  })

  it("returns immediately for an already-ready client", async () => {
    const { waitForRedisClientReady } = await import("./client.ts")

    class FakeRedisClient extends EventEmitter {
      status = "ready"
      connect = vi.fn()
    }

    const client = new FakeRedisClient()

    await expect(waitForRedisClientReady(client as never)).resolves.toBe(client)
    expect(client.connect).not.toHaveBeenCalled()
  })
})
