import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("createBullMqRedisConnection", () => {
  const clusterConstructor = vi.fn()
  const redisConstructor = vi.fn()

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

    vi.doMock("ioredis", () => ({
      Cluster: clusterConstructor,
      Redis: redisConstructor,
    }))
  })

  afterEach(() => {
    vi.resetModules()
  })

  // TODO: These tests timeout in CI due to dynamic import hanging.
  // Skipping until we can investigate the root cause.
  // See: https://github.com/latitude-dev/latitude-llm/pull/2857
  it.skip("creates a single-node Redis connection by default", async () => {
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

  it.skip("creates a Redis Cluster connection when cluster mode is enabled", async () => {
    const { createBullMqRedisConnection } = await import("./connection.ts")

    const connection = createBullMqRedisConnection({
      host: "memorydb.example.com",
      port: 6379,
      tls: true,
      cluster: true,
    })

    expect(clusterConstructor).toHaveBeenCalledWith([{ host: "memorydb.example.com", port: 6379 }], {
      dnsLookup: expect.any(Function),
      redisOptions: expect.objectContaining({
        host: "memorydb.example.com",
        port: 6379,
        tls: {},
        maxRetriesPerRequest: null,
      }),
    })

    const clusterOptions = clusterConstructor.mock.calls[0]?.[1]
    expect(clusterOptions.dnsLookup).toBeTypeOf("function")

    const dnsLookupCallback = vi.fn()
    clusterOptions.dnsLookup("memorydb.example.com", dnsLookupCallback)
    expect(dnsLookupCallback).toHaveBeenCalledWith(null, "memorydb.example.com")

    expect(redisConstructor).not.toHaveBeenCalled()
    expect(connection).toEqual(
      expect.objectContaining({
        startupNodes: [{ host: "memorydb.example.com", port: 6379 }],
      }),
    )
  })
})
