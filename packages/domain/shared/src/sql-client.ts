import type { Effect } from "effect"
import { ServiceMap } from "effect"
import { z } from "zod"
import type { ConcurrentSqlTransactionError, RepositoryError } from "./errors.ts"
import type { OrganizationId } from "./id.ts"

export const sortDirectionSchema = z.enum(["asc", "desc"])
export type SortDirection = z.infer<typeof sortDirectionSchema>

/**
 * SqlClient provides database access and transaction management.
 *
 * This is a domain-level service that abstracts the Postgres database client,
 * allowing it to be mocked in tests. The generic parameter X allows
 * platforms to specify their concrete database/transaction type.
 */
export interface SqlClientShape<X = unknown> {
  // The context organization ID for this client.
  organizationId: OrganizationId
  /**
   * Run an Effect inside an RLS-enabled transaction.
   * Commits on success, rolls back on any failure.
   *
   * Domain errors from the effect are propagated through the Effect error channel.
   * Database errors are wrapped as RepositoryError.
   */
  readonly transaction: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | RepositoryError | ConcurrentSqlTransactionError, R | SqlClient>

  /**
   * Run a callback inside an RLS-enabled transaction.
   * The platform provides the concrete type X.
   * If already inside a transaction, it's a pass-through proxy.
   */
  readonly query: <T>(
    fn: (tx: X, organizationId: OrganizationId) => Promise<T>,
  ) => Effect.Effect<T, RepositoryError, never>
}

/**
 * SqlClient service - provides database access and transaction management.
 * Defaults to unknown for the transaction type, which platforms will narrow.
 *
 * @effect-leakable-service
 * SqlClient is a per-request/per-job scope dependency (analogous to
 * HttpServerRequest). Repository services resolve it per-method so the
 * organization/transaction context reflects the caller's scope, rather
 * than being captured once at Layer build time. Leaking this requirement
 * through service interfaces is intentional.
 */
export class SqlClient extends ServiceMap.Service<SqlClient, SqlClientShape>()("@domain/shared/SqlClient") {}
