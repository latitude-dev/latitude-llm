import type { PostgresClient } from "@platform/db-postgres"
import { describe, expect, it, vi } from "vitest"
import { createRuntimePostgresClient } from "./runtime-postgres-client.ts"

const createFakeClient = (transaction: PostgresClient["transaction"]): PostgresClient =>
  ({
    pool: { end: vi.fn(async () => undefined) } as unknown as PostgresClient["pool"],
    db: {} as PostgresClient["db"],
    transaction,
  }) satisfies PostgresClient

const createTransactionMock = (
  fn: (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>,
): PostgresClient["transaction"] => {
  return vi.fn(async (callback) => fn(callback as (tx: unknown) => Promise<unknown>)) as PostgresClient["transaction"]
}

describe("createRuntimePostgresClient", () => {
  it("uses runtime client when transaction succeeds", async () => {
    const runtimeTransaction = createTransactionMock(async (fn) => fn("runtime-tx"))
    const createRuntimeClient = vi.fn(() => createFakeClient(runtimeTransaction))
    const repairRuntimeAccess = vi.fn(async () => {})

    const client = createRuntimePostgresClient({
      createRuntimeClient,
      repairRuntimeAccess,
    })

    const value = await client.transaction(async (tx) => String(tx))

    expect(value).toBe("runtime-tx")
    expect(createRuntimeClient).toHaveBeenCalledTimes(1)
    expect(repairRuntimeAccess).not.toHaveBeenCalled()
    expect(runtimeTransaction).toHaveBeenCalledTimes(1)
  })

  it("repairs runtime access and retries runtime client after auth failure", async () => {
    const failingRuntimeTransaction = createTransactionMock(async () => {
      throw new Error("password authentication failed for user \"latitude_app\"")
    })
    const recoveredRuntimeTransaction = createTransactionMock(async (fn) => fn("runtime-recovered-tx"))
    const firstClient = createFakeClient(failingRuntimeTransaction)
    const secondClient = createFakeClient(recoveredRuntimeTransaction)
    const createRuntimeClient = vi
      .fn<() => PostgresClient>()
      .mockImplementationOnce(() => firstClient)
      .mockImplementation(() => secondClient)
    const repairRuntimeAccess = vi.fn(async () => {})
    const onRepairAttempt = vi.fn()

    const client = createRuntimePostgresClient({
      createRuntimeClient,
      repairRuntimeAccess,
      onRepairAttempt,
    })

    const first = await client.transaction(async (tx) => String(tx))
    const second = await client.transaction(async (tx) => String(tx))

    expect(first).toBe("runtime-recovered-tx")
    expect(second).toBe("runtime-recovered-tx")
    expect(failingRuntimeTransaction).toHaveBeenCalledTimes(1)
    expect(recoveredRuntimeTransaction).toHaveBeenCalledTimes(2)
    expect(createRuntimeClient).toHaveBeenCalledTimes(2)
    expect(repairRuntimeAccess).toHaveBeenCalledTimes(1)
    expect(onRepairAttempt).toHaveBeenCalledTimes(1)
    expect(firstClient.pool.end).toHaveBeenCalledTimes(1)
  })

  it("rethrows non-auth runtime errors", async () => {
    const runtimeTransaction = createTransactionMock(async () => {
      throw new Error("connection timeout")
    })
    const createRuntimeClient = vi.fn(() => createFakeClient(runtimeTransaction))
    const repairRuntimeAccess = vi.fn(async () => {})

    const client = createRuntimePostgresClient({
      createRuntimeClient,
      repairRuntimeAccess,
    })

    await expect(client.transaction(async () => "ok")).rejects.toThrow("connection timeout")
    expect(repairRuntimeAccess).not.toHaveBeenCalled()
  })
})
