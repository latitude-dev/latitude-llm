import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape, OrganizationId, RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ChSqlClientLive } from "./ch-sql-client.ts"

const fakeClient = {} as ClickHouseClient
const organizationId = OrganizationId("org-1")

const econnreset = () => Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })

const runQuery = <T>(fn: (client: ClickHouseClient, organizationId: OrganizationId) => Promise<T>) =>
  Effect.gen(function* () {
    const client = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
    return yield* client.query(fn)
  }).pipe(Effect.provide(ChSqlClientLive(fakeClient, organizationId)))

describe("ChSqlClientLive query retry", () => {
  it("retries a connection reset and eventually succeeds", async () => {
    let attempts = 0
    const result = await Effect.runPromise(
      runQuery(async () => {
        attempts += 1
        if (attempts < 3) throw econnreset()
        return "ok"
      }),
    )

    expect(result).toBe("ok")
    expect(attempts).toBe(3)
  })

  it("gives up after exhausting retries on persistent resets", async () => {
    let attempts = 0
    const exit = await Effect.runPromiseExit(
      runQuery(async () => {
        attempts += 1
        throw econnreset()
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(attempts).toBe(3)
  })

  it("does not retry non-reset errors", async () => {
    let attempts = 0
    const exit = await Effect.runPromiseExit(
      runQuery(async () => {
        attempts += 1
        throw new Error("Code: 159. DB::Exception: Timeout exceeded")
      }),
    )

    expect(exit._tag).toBe("Failure")
    expect(attempts).toBe(1)
  })

  it("surfaces a RepositoryError to callers", async () => {
    const error = await Effect.runPromise(
      runQuery(async () => {
        throw new Error("boom")
      }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(RepositoryError)
    expect(error.operation).toBe("query")
  })
})
