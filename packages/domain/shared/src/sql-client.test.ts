import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { OrganizationId } from "./id.ts"
import { SqlClient, type SqlClientShape } from "./sql-client.ts"

describe("SqlClient service tag", () => {
  it("resolves the same implementation via yield* and Effect.service after Layer.succeed", async () => {
    const orgId = "test-org-123456789012" as OrganizationId
    const impl: SqlClientShape = {
      organizationId: orgId,
      transaction: <A, E, R>(e: Effect.Effect<A, E, R>) => e,
      query: <T>(_fn: (tx: unknown, oid: OrganizationId) => Promise<T>) =>
        Effect.succeed("query-result" as unknown as T),
    }

    const layer = Layer.succeed(SqlClient, impl)

    const viaGen = Effect.gen(function* () {
      const client = yield* SqlClient
      const q = yield* client.query(async () => "unused")
      return { client, q }
    }).pipe(Effect.provide(layer))

    const viaService = Effect.gen(function* () {
      const client = yield* Effect.service(SqlClient)
      const q = yield* client.query(async () => "unused")
      return { client, q }
    }).pipe(Effect.provide(layer))

    const [a, b] = await Promise.all([Effect.runPromise(viaGen), Effect.runPromise(viaService)])

    expect(a.client).toBe(impl)
    expect(b.client).toBe(impl)
    expect(a.q).toBe("query-result")
    expect(b.q).toBe("query-result")
  })
})
