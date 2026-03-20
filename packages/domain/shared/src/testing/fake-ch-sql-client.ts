import { Effect } from "effect"
import type { ChSqlClientShape } from "../ch-sql-client.ts"
import { toRepositoryError } from "../errors.ts"
import type { OrganizationId } from "../id.ts"

export const createFakeChSqlClient = (overrides?: Partial<ChSqlClientShape>): ChSqlClientShape => ({
  organizationId: "fake-org" as OrganizationId,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: <T>(_fn: (client: unknown, organizationId: OrganizationId) => Promise<T>) =>
    Effect.tryPromise({
      try: () => Promise.resolve([] as unknown as T),
      catch: (error) => toRepositoryError(error, "query"),
    }),
  ...overrides,
})
