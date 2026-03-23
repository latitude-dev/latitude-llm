import { Effect } from "effect"
import { toRepositoryError } from "../errors.ts"
import type { OrganizationId } from "../id.ts"
import type { SqlClientShape } from "../sql-client.ts"

export const createFakeSqlClient = (overrides?: Partial<SqlClientShape>): SqlClientShape => ({
  organizationId: "fake-org" as OrganizationId,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: <T>(_fn: (tx: unknown, organizationId: OrganizationId) => Promise<T>) =>
    Effect.tryPromise({
      try: () => Promise.resolve([] as unknown as T),
      catch: (error) => toRepositoryError(error, "query"),
    }),
  ...overrides,
})
