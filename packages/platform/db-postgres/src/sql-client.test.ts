import { OrganizationId, SqlClient } from "@domain/shared"
import { Data, Effect, Exit } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { sqlClientLogErrorMock } = vi.hoisted(() => ({
  sqlClientLogErrorMock: vi.fn(),
}))

vi.mock("@repo/observability", () => ({
  createLogger: () => ({
    error: sqlClientLogErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

class TestError extends Data.TaggedError("TestError")<{ message: string }> {}

import type { Operator, PostgresClient } from "./client.ts"
import { SqlClientLive } from "./sql-client.ts"

interface MockTx {
  readonly id: symbol
  execute: (stmt: unknown) => Promise<unknown>
}

interface MockClientState {
  transactionCallCount: number
  executedStatements: unknown[]
  txInstances: Operator[]
}

function createMockPostgresClient(
  state: MockClientState,
  options?: {
    simulateDistinctTransactionCompletionError?: boolean
    beforeBegin?: () => Promise<void>
    beginError?: Error
    contextError?: Error
    rollback?: () => Promise<void>
  },
): PostgresClient {
  const client: PostgresClient = {
    pool: {} as PostgresClient["pool"],
    db: {} as PostgresClient["db"],
    transaction: async (fn) => {
      await options?.beforeBegin?.()
      if (options?.beginError) throw options.beginError
      const mockTx: MockTx = {
        id: Symbol("tx"),
        execute: async (stmt: unknown) => {
          if (options?.contextError) throw options.contextError
          state.executedStatements.push(stmt)
          return undefined
        },
      }
      const txAsOperator = mockTx as unknown as Operator

      state.transactionCallCount += 1
      state.txInstances.push(txAsOperator)
      try {
        return await fn(txAsOperator as Parameters<Parameters<PostgresClient["transaction"]>[0]>[0])
      } catch (e) {
        await options?.rollback?.()
        if (options?.simulateDistinctTransactionCompletionError) {
          throw new Error("simulated rollback/commit failure after effect error")
        }
        throw e
      }
    },
  }
  return client
}

function createGate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function extractSetConfigOrgId(stmt: unknown): string | null {
  if (
    stmt !== null &&
    typeof stmt === "object" &&
    (("params" in stmt && Array.isArray((stmt as { params: unknown }).params)) ||
      ("queryChunks" in stmt && Array.isArray((stmt as { queryChunks: unknown }).queryChunks)))
  ) {
    const params =
      "params" in stmt && Array.isArray((stmt as { params: unknown }).params)
        ? (stmt as { params: unknown[] }).params
        : (stmt as { queryChunks: unknown[] }).queryChunks
    for (let index = params.length - 1; index >= 0; index -= 1) {
      const param = params[index]
      if (typeof param === "string") return param
    }
  }
  return null
}

async function runWithSqlClient<R, E>(
  client: PostgresClient,
  organizationId: OrganizationId,
  f: (sqlClient: import("@domain/shared").SqlClientShape<Operator>) => Effect.Effect<R, E, SqlClient>,
): Promise<R> {
  const layer = SqlClientLive(client, organizationId)
  const effect = Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* f(sqlClient as import("@domain/shared").SqlClientShape<Operator>)
  }).pipe(Effect.provide(layer))
  return Effect.runPromise(effect)
}

describe("SqlClientLive", () => {
  let state: MockClientState

  beforeEach(() => {
    state = {
      transactionCallCount: 0,
      executedStatements: [],
      txInstances: [],
    }
    sqlClientLogErrorMock.mockClear()
  })

  afterEach(() => {
    expect(state.transactionCallCount).toBeDefined()
  })

  describe("single transaction", () => {
    it("starts one DB transaction and returns the inner effect value", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-single")

      const result = await runWithSqlClient(client, orgId, (sql) => sql.transaction(Effect.succeed(42)))

      expect(result).toBe(42)
      expect(state.transactionCallCount).toBe(1)
      expect(state.executedStatements.length).toBe(2)
    })

    it("invokes set_config (RLS context) once per transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("tenant-abc")

      await runWithSqlClient(client, orgId, (sql) => sql.transaction(Effect.succeed(null)))

      expect(state.transactionCallCount).toBe(1)
      expect(state.executedStatements.length).toBe(2)
      const orgFromStmt = state.executedStatements.map(extractSetConfigOrgId).find((value) => value === "tenant-abc")
      if (orgFromStmt !== null) expect(orgFromStmt).toBe("tenant-abc")
    })
  })

  describe("nested transactions (single DB transaction)", () => {
    it("does not start a second DB transaction when transaction() is called inside an open transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-nested")

      const result = await runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(
          Effect.gen(function* () {
            const inner = yield* SqlClient
            return yield* (inner as import("@domain/shared").SqlClientShape<Operator>).transaction(Effect.succeed(99))
          }),
        ),
      )

      expect(result).toBe(99)
      expect(state.transactionCallCount).toBe(1)
    })

    it("reuses the same tx for multiple nested transaction() calls", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-multi-nested")

      const result = await runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(
          Effect.gen(function* () {
            const sc = yield* SqlClient
            const shape = sc as import("@domain/shared").SqlClientShape<Operator>
            const a = yield* shape.transaction(Effect.succeed(1))
            const b = yield* shape.transaction(Effect.succeed(2))
            const c = yield* shape.transaction(Effect.succeed(3))
            return a + b + c
          }),
        ),
      )

      expect(result).toBe(6)
      expect(state.transactionCallCount).toBe(1)
    })
  })

  describe("query inside transaction (same connection)", () => {
    it("uses the same tx for query() when called inside an open transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-query-in-tx")
      let capturedTx: Operator | null = null
      let capturedOrgId: OrganizationId | null = null

      await runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(
          Effect.gen(function* () {
            const result = yield* sql.query(async (tx, oid) => {
              capturedTx = tx
              capturedOrgId = oid
              return "done"
            })
            return result
          }),
        ),
      )

      expect(state.transactionCallCount).toBe(1)
      expect(capturedTx).not.toBeNull()
      expect(capturedOrgId).toBe(orgId)
      expect(state.txInstances[0]).toBe(capturedTx)
    })

    it("does not start a new transaction for query() when already in a transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-no-double-tx")

      await runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(
          Effect.gen(function* () {
            yield* sql.query(async () => "first")
            yield* sql.query(async () => "second")
            return "ok"
          }),
        ),
      )

      expect(state.transactionCallCount).toBe(1)
    })
  })

  describe("query outside transaction (own transaction)", () => {
    it("starts a single transaction and sets RLS when query() is called without an open transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-query-alone")

      const result = await runWithSqlClient(client, orgId, (sql) =>
        sql.query(async (_tx, oid) => {
          expect(oid).toBe(orgId)
          return "result"
        }),
      )

      expect(result).toBe("result")
      expect(state.transactionCallCount).toBe(1)
      expect(state.executedStatements.length).toBe(2)
      const orgFromStmt = state.executedStatements
        .map(extractSetConfigOrgId)
        .find((value) => value === "org-query-alone")
      if (orgFromStmt !== null) expect(orgFromStmt).toBe("org-query-alone")
    })
  })

  describe("scoped tenancy", () => {
    it("passes the same organizationId to query callbacks inside and outside transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("scoped-tenant-1")
      const seenOrgIds: OrganizationId[] = []

      await runWithSqlClient(client, orgId, (sql) =>
        Effect.gen(function* () {
          yield* sql.query(async (_tx, oid) => {
            seenOrgIds.push(oid)
            return null
          })
          return yield* sql.transaction(
            sql.query(async (_tx, oid) => {
              seenOrgIds.push(oid)
              return null
            }),
          )
        }),
      )

      expect(seenOrgIds).toHaveLength(2)
      expect(seenOrgIds[0]).toBe(orgId)
      expect(seenOrgIds[1]).toBe(orgId)
    })

    it("uses default organizationId when not provided", async () => {
      const client = createMockPostgresClient(state)
      const defaultOrgId = OrganizationId("system")
      const layer = SqlClientLive(client)
      const effect = Effect.gen(function* () {
        const sql = yield* SqlClient
        return yield* (sql as import("@domain/shared").SqlClientShape<Operator>).transaction(
          Effect.succeed((sql as import("@domain/shared").SqlClientShape<Operator>).organizationId),
        )
      }).pipe(Effect.provide(layer))
      const result = await Effect.runPromise(effect)

      expect(result).toBe(defaultOrgId)
      expect(state.executedStatements.length).toBe(1)
    })
  })

  describe("concurrent transactions", () => {
    it("opens independent DB transactions for concurrent sibling fibers on the same SqlClient", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-concurrent")

      const layer = SqlClientLive(client, orgId)
      const effect = Effect.gen(function* () {
        const sqlClient = yield* SqlClient
        const shape = sqlClient as import("@domain/shared").SqlClientShape<Operator>
        return yield* Effect.all([shape.transaction(Effect.succeed("a")), shape.transaction(Effect.succeed("b"))], {
          concurrency: 2,
        })
      }).pipe(Effect.provide(layer))

      await expect(Effect.runPromise(effect)).resolves.toEqual(["a", "b"])
      expect(state.transactionCallCount).toBe(2)
      expect(state.txInstances[0]).not.toBe(state.txInstances[1])
    })

    it("keeps query() calls inside each concurrent transaction on that fiber's own transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-concurrent-query")
      const layer = SqlClientLive(client, orgId)
      const seenTx: Operator[] = []

      const effect = Effect.gen(function* () {
        const sqlClient = yield* SqlClient
        const shape = sqlClient as import("@domain/shared").SqlClientShape<Operator>
        return yield* Effect.all(
          [
            shape.transaction(
              shape.query(async (tx) => {
                seenTx.push(tx)
                return "a"
              }),
            ),
            shape.transaction(
              shape.query(async (tx) => {
                seenTx.push(tx)
                return "b"
              }),
            ),
          ],
          { concurrency: 2 },
        )
      }).pipe(Effect.provide(layer))

      await expect(Effect.runPromise(effect)).resolves.toEqual(["a", "b"])
      expect(state.transactionCallCount).toBe(2)
      expect(seenTx).toHaveLength(2)
      expect(seenTx[0]).not.toBe(seenTx[1])
      expect(state.txInstances).toEqual(expect.arrayContaining(seenTx))
    })

    it("allows sequential transaction() calls on the same SqlClient after one completes", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-sequential")

      // Run two transactions sequentially — this is fine; txOpening is cleared
      // after each transaction completes.
      const layer = SqlClientLive(client, orgId)
      const effect = Effect.gen(function* () {
        const sqlClient = yield* SqlClient
        const shape = sqlClient as import("@domain/shared").SqlClientShape<Operator>
        const a = yield* shape.transaction(Effect.succeed(1))
        const b = yield* shape.transaction(Effect.succeed(2))
        return a + b
      }).pipe(Effect.provide(layer))

      const result = await Effect.runPromise(effect)
      expect(result).toBe(3)
      expect(state.transactionCallCount).toBe(2)
    })
  })

  describe("interruption cleanup", () => {
    it.each(["cancellation", "timeout"] as const)("waits for rollback after %s", async (mode) => {
      const started = createGate()
      const rollbackStarted = createGate()
      const releaseRollback = createGate()
      let released = false
      let finished = false
      const client = createMockPostgresClient(state, {
        rollback: async () => {
          rollbackStarted.resolve()
          await releaseRollback.promise
          released = true
        },
      })
      const controller = new AbortController()
      const program = Effect.gen(function* () {
        const sql = yield* SqlClient
        return yield* sql.transaction(Effect.sync(() => started.resolve()).pipe(Effect.andThen(Effect.never)))
      }).pipe(Effect.provide(SqlClientLive(client, OrganizationId("org-interrupt"))))
      const result = Effect.runPromiseExit(mode === "timeout" ? program.pipe(Effect.timeout("50 millis")) : program, {
        signal: controller.signal,
      }).then((exit) => {
        finished = true
        return exit
      })
      await started.promise
      if (mode === "cancellation") controller.abort()
      await rollbackStarted.promise
      expect(finished).toBe(false)
      expect(released).toBe(false)
      releaseRollback.resolve()
      expect(Exit.isFailure(await result)).toBe(true)
      expect(released).toBe(true)
      expect(state.transactionCallCount).toBe(1)
    })

    it("rolls back when cancellation arrives during acquisition", async () => {
      const acquiring = createGate()
      const acquired = createGate()
      let rolledBack = false
      let bodyRan = false
      const client = createMockPostgresClient(state, {
        beforeBegin: async () => {
          acquiring.resolve()
          await acquired.promise
        },
        rollback: async () => {
          rolledBack = true
        },
      })
      const controller = new AbortController()
      const result = Effect.runPromiseExit(
        Effect.gen(function* () {
          const sql = yield* SqlClient
          yield* sql.transaction(
            Effect.sync(() => {
              bodyRan = true
            }),
          )
        }).pipe(Effect.provide(SqlClientLive(client))),
        { signal: controller.signal },
      )
      await acquiring.promise
      controller.abort()
      acquired.resolve()
      expect(Exit.isFailure(await result)).toBe(true)
      expect(bodyRan).toBe(false)
      expect(rolledBack).toBe(true)
    })

    it.each(["beginError", "contextError"] as const)("returns a repository error after %s", async (failure) => {
      let rolledBack = false
      const client = createMockPostgresClient(state, {
        [failure]: new Error("setup failed"),
        rollback: async () => {
          rolledBack = true
        },
      })
      const result = await runWithSqlClient(client, OrganizationId("org-setup"), (sql) =>
        Effect.exit(sql.transaction(Effect.die("body must not run"))),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(result.cause.reasons[0]).toMatchObject({ error: { _tag: "RepositoryError" } })
      expect(rolledBack).toBe(failure === "contextError")
    })
  })

  describe("failure and rollback", () => {
    it("propagates failure from inner effect and does not commit", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-fail")

      const effect = runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(Effect.fail(new TestError({ message: "intentional failure" }))),
      )

      await expect(effect).rejects.toThrow("intentional failure")
      expect(state.transactionCallCount).toBe(1)
    })

    it("resets activeTx after failure so subsequent query() starts its own transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-reset")

      const failOnce = runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(Effect.fail(new TestError({ message: "fail" }))),
      )
      await expect(failOnce).rejects.toThrow("fail")

      state.transactionCallCount = 0
      state.executedStatements = []
      state.txInstances = []

      const result = await runWithSqlClient(client, orgId, (sql) => sql.query(async () => "after-fail"))

      expect(result).toBe("after-fail")
      expect(state.transactionCallCount).toBe(1)
    })

    it("logs when the driver reports a distinct error after effect failure", async () => {
      const client = createMockPostgresClient(state, { simulateDistinctTransactionCompletionError: true })
      const orgId = OrganizationId("org-distinct-db-error")

      const failOnce = runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(Effect.fail(new TestError({ message: "business rule" }))),
      )
      await expect(failOnce).rejects.toThrow("business rule")

      expect(sqlClientLogErrorMock).toHaveBeenCalledTimes(1)
      expect(sqlClientLogErrorMock.mock.calls[0]?.[0]).toContain("completing transaction after effect failure")
    })
  })
})
