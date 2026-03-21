import type { PostgresClient } from "@platform/db-postgres"
import { describe, expect, it, vi } from "vitest"
import { ensureRuntimePostgresRoleAccess, isRuntimeAuthError } from "./runtime-postgres-role.ts"

const createFakeClient = (transaction: PostgresClient["transaction"]): PostgresClient =>
  ({
    pool: {} as PostgresClient["pool"],
    db: {} as PostgresClient["db"],
    transaction,
  }) satisfies PostgresClient

const createTransactionMock = (
  fn: (callback: (tx: { execute: (query: unknown) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => Promise<unknown>,
): PostgresClient["transaction"] => {
  return vi.fn(async (callback) =>
    fn(callback as (tx: { execute: (query: unknown) => Promise<{ rows: unknown[] }> }) => Promise<unknown>),
  ) as PostgresClient["transaction"]
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

describe("ensureRuntimePostgresRoleAccess", () => {
  it("creates or updates runtime role and grants privileges", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })

    const transaction = createTransactionMock(async (fn) => fn({ execute }))
    const adminClient = createFakeClient(transaction)

    await ensureRuntimePostgresRoleAccess({
      adminClient,
      runtimeDatabaseUrl: "postgres://latitude_app:secret@localhost:5432/latitude_development",
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(5)
  })

  it("does nothing when runtime database url cannot be parsed", async () => {
    const transaction = createTransactionMock(async (fn) =>
      fn({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      }),
    )
    const adminClient = createFakeClient(transaction)

    await ensureRuntimePostgresRoleAccess({
      adminClient,
      runtimeDatabaseUrl: "not-a-valid-url",
    })

    expect(transaction).not.toHaveBeenCalled()
  })

  it("does nothing when runtime role or database are missing", async () => {
    const transaction = createTransactionMock(async (fn) =>
      fn({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
      }),
    )
    const adminClient = createFakeClient(transaction)

    await ensureRuntimePostgresRoleAccess({
      adminClient,
      runtimeDatabaseUrl: "postgres://:secret@localhost:5432/",
    })

    expect(transaction).not.toHaveBeenCalled()
  })

  it("handles role names with dashes", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    const transaction = createTransactionMock(async (fn) => fn({ execute }))
    const adminClient = createFakeClient(transaction)

    await ensureRuntimePostgresRoleAccess({
      adminClient,
      runtimeDatabaseUrl: "postgres://lat-app:secret@localhost:5432/latitude_development",
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(5)
  })
})
