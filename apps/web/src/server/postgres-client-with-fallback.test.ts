import type { PostgresClient } from "@platform/db-postgres"
import { describe, expect, it, vi } from "vitest"
import { createPostgresClientWithFallback, isRuntimeAuthError } from "./postgres-client-with-fallback.ts"

const createFakeClient = (transaction: PostgresClient["transaction"]): PostgresClient =>
  ({
    pool: {} as PostgresClient["pool"],
    db: {} as PostgresClient["db"],
    transaction,
  }) satisfies PostgresClient

const createTransactionMock = (
  fn: (callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>,
): PostgresClient["transaction"] => {
  return vi.fn(async (callback) => fn(callback as (tx: unknown) => Promise<unknown>)) as PostgresClient["transaction"]
}

describe("isRuntimeAuthError", () => {
  it("matches runtime auth failures", () => {
    expect(isRuntimeAuthError(new Error("password authentication failed for user \"latitude_app\""))).toBe(true)
    expect(isRuntimeAuthError(new Error("role \"latitude_app\" does not exist"))).toBe(true)
    expect(isRuntimeAuthError(new Error("no pg_hba.conf entry for host"))).toBe(true)
  })

  it("does not match unrelated errors", () => {
    expect(isRuntimeAuthError(new Error("timeout exceeded"))).toBe(false)
    expect(isRuntimeAuthError("password authentication failed")).toBe(false)
  })
})

describe("createPostgresClientWithFallback", () => {
  it("uses runtime client when runtime transaction succeeds", async () => {
    const runtimeTransaction = createTransactionMock(async (fn) => fn("runtime-tx"))
    const adminTransaction = createTransactionMock(async (fn) => fn("admin-tx"))

    const client = createPostgresClientWithFallback({
      runtimeClient: createFakeClient(runtimeTransaction),
      adminClient: createFakeClient(adminTransaction),
    })

    const value = await client.transaction(async (tx) => String(tx))

    expect(value).toBe("runtime-tx")
    expect(runtimeTransaction).toHaveBeenCalledTimes(1)
    expect(adminTransaction).not.toHaveBeenCalled()
  })

  it("falls back to admin client after runtime auth failure", async () => {
    const runtimeTransaction = createTransactionMock(async () => {
      throw new Error("password authentication failed for user \"latitude_app\"")
    })
    const adminTransaction = createTransactionMock(async (fn) => fn("admin-tx"))
    const onFallback = vi.fn()

    const client = createPostgresClientWithFallback({
      runtimeClient: createFakeClient(runtimeTransaction),
      adminClient: createFakeClient(adminTransaction),
      onFallback,
    })

    const first = await client.transaction(async (tx) => String(tx))
    const second = await client.transaction(async (tx) => String(tx))

    expect(first).toBe("admin-tx")
    expect(second).toBe("admin-tx")
    expect(runtimeTransaction).toHaveBeenCalledTimes(1)
    expect(adminTransaction).toHaveBeenCalledTimes(2)
    expect(onFallback).toHaveBeenCalledTimes(1)
  })

  it("rethrows non-auth runtime errors", async () => {
    const runtimeTransaction = createTransactionMock(async () => {
      throw new Error("connection timeout")
    })
    const adminTransaction = createTransactionMock(async (fn) => fn("admin-tx"))

    const client = createPostgresClientWithFallback({
      runtimeClient: createFakeClient(runtimeTransaction),
      adminClient: createFakeClient(adminTransaction),
    })

    await expect(client.transaction(async () => "ok")).rejects.toThrow("connection timeout")
    expect(adminTransaction).not.toHaveBeenCalled()
  })
})
