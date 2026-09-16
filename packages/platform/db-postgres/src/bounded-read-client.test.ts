import { EventEmitter } from "node:events"
import type { PoolClient } from "pg"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type BoundedReadPostgresConfig,
  buildBoundedReadPostgresClient,
  createBoundedReadPostgresClient,
} from "./bounded-read-client.ts"

const config: BoundedReadPostgresConfig = {
  acquisitionTimeoutMs: 10,
  transactionTimeoutMs: 100,
  statementTimeoutMs: 50,
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

const createClient = () => {
  const query = vi.fn(async () => ({ rows: [] }))
  const release = vi.fn()
  const client = Object.assign(new EventEmitter(), { query, release }) as unknown as PoolClient
  return { client, query, release }
}

const createPool = (...connections: Array<Promise<PoolClient>>) => {
  const connect = vi.fn(() => connections.shift() ?? Promise.reject(new Error("No connection available")))
  const on = vi.fn()
  return { connect, on }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("bounded read Postgres client", () => {
  it("owns an isolated pool with one connection", async () => {
    const first = createBoundedReadPostgresClient({ ...config, databaseUrl: "postgres://localhost/first" })
    const second = createBoundedReadPostgresClient({ ...config, databaseUrl: "postgres://localhost/second" })

    expect(first.pool).not.toBe(second.pool)
    expect(first.pool.options.max).toBe(1)
    expect(first.pool.options.connectionTimeoutMillis).toBe(config.acquisitionTimeoutMs)

    await Promise.all([first.pool.end(), second.pool.end()])
  })

  it("times out acquisition and does not invoke a callback after a late checkout", async () => {
    vi.useFakeTimers()
    const checkout = deferred<PoolClient>()
    const { client, release } = createClient()
    const pool = createPool(checkout.promise)
    const postgres = buildBoundedReadPostgresClient(pool, config)
    const callback = vi.fn(async () => "done")

    const transaction = postgres.transaction(callback)
    const timedOut = expect(transaction).rejects.toThrow("timed out")
    await vi.advanceTimersByTimeAsync(config.transactionTimeoutMs)

    await timedOut
    checkout.resolve(client)
    await vi.advanceTimersByTimeAsync(0)

    expect(callback).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledWith(true)
  })

  it("destroys a timed-out active connection and allows a replacement transaction", async () => {
    vi.useFakeTimers()
    const first = createClient()
    const second = createClient()
    const callbackDone = deferred<string>()
    const pool = createPool(Promise.resolve(first.client), Promise.resolve(second.client))
    const postgres = buildBoundedReadPostgresClient(pool, config)

    const timedOut = postgres.transaction(async () => callbackDone.promise)
    const timedOutResult = expect(timedOut).rejects.toThrow("timed out")
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(config.transactionTimeoutMs)

    await timedOutResult
    expect(first.release).toHaveBeenCalledWith(true)

    await expect(postgres.transaction(async () => "replacement")).resolves.toBe("replacement")
    expect(second.release).toHaveBeenCalledWith(false)

    callbackDone.resolve("late")
    await Promise.resolve()
    expect(first.release).toHaveBeenCalledOnce()
  })

  it("destroys a checked-out client that emits an error and uses a replacement connection", async () => {
    const first = createClient()
    const second = createClient()
    const callbackDone = deferred<string>()
    const pool = createPool(Promise.resolve(first.client), Promise.resolve(second.client))
    const postgres = buildBoundedReadPostgresClient(pool, config)

    const active = postgres.transaction(async () => callbackDone.promise)
    await Promise.resolve()
    await Promise.resolve()

    first.client.emit("error", new Error("connection lost"))

    await expect(active).rejects.toThrow("connection lost")
    expect(first.release).toHaveBeenCalledOnce()
    expect(first.release).toHaveBeenCalledWith(true)
    expect(first.client.listenerCount("error")).toBe(0)

    await expect(postgres.transaction(async () => "replacement")).resolves.toBe("replacement")
    expect(second.release).toHaveBeenCalledWith(false)
    expect(second.client.listenerCount("error")).toBe(0)

    callbackDone.resolve("late")
    await Promise.resolve()
    expect(first.release).toHaveBeenCalledOnce()
  })

  it("rejects a concurrent transaction without queueing a checkout", async () => {
    const checkout = deferred<PoolClient>()
    const pool = createPool(checkout.promise)
    const postgres = buildBoundedReadPostgresClient(pool, config)

    const active = postgres.transaction(async () => "active")
    await expect(postgres.transaction(async () => "queued")).rejects.toThrow("busy")
    expect(pool.connect).toHaveBeenCalledOnce()

    const client = createClient()
    checkout.resolve(client.client)
    await expect(active).resolves.toBe("active")
    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN READ ONLY")
    expect(client.query).toHaveBeenNthCalledWith(2, "SELECT set_config('statement_timeout', $1, true)", ["50"])
    expect(client.query).toHaveBeenNthCalledWith(3, "COMMIT")
  })

  it("releases a failed transaction once and destroys its connection", async () => {
    const { client, release } = createClient()
    const pool = createPool(Promise.resolve(client))
    const postgres = buildBoundedReadPostgresClient(pool, config)

    await expect(postgres.transaction(async () => Promise.reject(new Error("failed")))).rejects.toThrow("failed")

    expect(release).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledWith(true)
  })

  it.each([
    { ...config, acquisitionTimeoutMs: 0 },
    { ...config, transactionTimeoutMs: Number.POSITIVE_INFINITY },
    { ...config, statementTimeoutMs: 1.5 },
  ])("rejects invalid limits", (invalidConfig) => {
    expect(() => createBoundedReadPostgresClient(invalidConfig)).toThrow(RangeError)
  })
})
