import { OrganizationId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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

function createMockPostgresClient(state: MockClientState): PostgresClient {
  const mockTx: MockTx = {
    id: Symbol("tx"),
    execute: async (stmt: unknown) => {
      state.executedStatements.push(stmt)
      return undefined
    },
  }

  const txAsOperator = mockTx as unknown as Operator
  const client: PostgresClient = {
    pool: {} as PostgresClient["pool"],
    db: {} as PostgresClient["db"],
    transaction: async (fn) => {
      state.transactionCallCount += 1
      state.txInstances.push(txAsOperator)
      return fn(txAsOperator as Parameters<Parameters<PostgresClient["transaction"]>[0]>[0])
    },
  }
  return client
}

function extractSetConfigOrgId(stmt: unknown): string | null {
  if (
    stmt !== null &&
    typeof stmt === "object" &&
    "params" in stmt &&
    Array.isArray((stmt as { params: unknown }).params)
  ) {
    const params = (stmt as { params: unknown[] }).params
    if (params.length >= 2 && typeof params[1] === "string") return params[1]
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
      expect(state.executedStatements.length).toBe(1)
    })

    it("invokes set_config (RLS context) once per transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("tenant-abc")

      await runWithSqlClient(client, orgId, (sql) => sql.transaction(Effect.succeed(null)))

      expect(state.transactionCallCount).toBe(1)
      expect(state.executedStatements.length).toBe(1)
      const orgFromStmt = extractSetConfigOrgId(state.executedStatements[0])
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
      expect(state.executedStatements.length).toBe(1)
      const orgFromStmt = extractSetConfigOrgId(state.executedStatements[0])
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
            Effect.gen(function* () {
              return yield* sql.query(async (_tx, oid) => {
                seenOrgIds.push(oid)
                return null
              })
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
      expect(state.executedStatements.length).toBe(0)
    })
  })

  describe("failure and rollback", () => {
    it("propagates failure from inner effect and does not commit", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-fail")

      const effect = runWithSqlClient(client, orgId, (sql) =>
        sql.transaction(Effect.fail(new Error("intentional failure"))),
      )

      await expect(effect).rejects.toThrow("intentional failure")
      expect(state.transactionCallCount).toBe(1)
    })

    it("resets activeTx after failure so subsequent query() starts its own transaction", async () => {
      const client = createMockPostgresClient(state)
      const orgId = OrganizationId("org-reset")

      const failOnce = runWithSqlClient(client, orgId, (sql) => sql.transaction(Effect.fail(new Error("fail"))))
      await expect(failOnce).rejects.toThrow("fail")

      state.transactionCallCount = 0
      state.executedStatements = []
      state.txInstances = []

      const result = await runWithSqlClient(client, orgId, (sql) => sql.query(async () => "after-fail"))

      expect(result).toBe("after-fail")
      expect(state.transactionCallCount).toBe(1)
    })
  })
})
