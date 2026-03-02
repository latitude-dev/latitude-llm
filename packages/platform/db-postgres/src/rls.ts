import type { OrganizationId } from "@domain/shared-kernel";
import { Effect } from "effect";
import { Data } from "effect";
import type { Pool, PoolClient } from "pg";

/**
 * Row Level Security (RLS) helpers for multi-tenancy.
 *
 * These utilities help set the organization context for RLS policies
 * that filter data based on organization_id.
 */

// Error types for RLS operations
export class RLSError extends Data.TaggedError("RLSError")<{
  readonly cause: unknown;
  readonly operation: string;
}> {}

/**
 * Set the organization context for the current connection.
 * This enables RLS policies to filter by organization_id.
 *
 * Uses SET LOCAL (transaction-level) to avoid leaking context.
 */
export const setOrganizationContext = (
  client: PoolClient,
  organizationId: OrganizationId,
): Effect.Effect<void, RLSError> => {
  return Effect.tryPromise({
    try: () => client.query("SET LOCAL app.current_organization_id = $1", [organizationId]),
    catch: (error) => new RLSError({ cause: error, operation: "setOrganizationContext" }),
  });
};

/**
 * Reset the organization context after operations.
 * Good practice to clean up even though transaction end clears it.
 */
export const resetOrganizationContext = (client: PoolClient): Effect.Effect<void, RLSError> => {
  return Effect.tryPromise({
    try: () => client.query("RESET app.current_organization_id"),
    catch: (error) => new RLSError({ cause: error, operation: "resetOrganizationContext" }),
  });
};

/**
 * Set user context for RLS policies that check user membership.
 */
export const setUserContext = (
  client: PoolClient,
  userId: string,
): Effect.Effect<void, RLSError> => {
  return Effect.tryPromise({
    try: () => client.query("SET LOCAL app.current_user_id = $1", [userId]),
    catch: (error) => new RLSError({ cause: error, operation: "setUserContext" }),
  });
};

/**
 * Acquire a client from the pool.
 */
const acquireClient = (pool: Pool): Effect.Effect<PoolClient, RLSError> =>
  Effect.tryPromise({
    try: () => pool.connect(),
    catch: (error) => new RLSError({ cause: error, operation: "acquireClient" }),
  });

/**
 * Release a client back to the pool.
 */
const releaseClient = (client: PoolClient): Effect.Effect<void, never> =>
  Effect.sync(() => client.release());

/**
 * Rollback transaction - never fails.
 */
const rollback = (client: PoolClient): Effect.Effect<void, never> =>
  Effect.tryPromise({
    try: () => client.query("ROLLBACK").catch(() => {}),
    catch: () => {}, // Ignore rollback errors
  }).pipe(Effect.orDie);

/**
 * Execute a database operation with organization context set.
 * Automatically sets context before and resets after.
 *
 * Uses Effect.acquireUseRelease for proper resource management.
 * Usage:
 * ```typescript
 * const result = await Effect.runPromise(
 *   withOrganizationContext(pool, organizationId, (client) =>
 *     Effect.tryPromise(() => dbOperation(client))
 *   )
 * );
 * ```
 */
export const withOrganizationContext = <T, E>(
  pool: Pool,
  organizationId: OrganizationId,
  operation: (client: PoolClient) => Effect.Effect<T, E>,
): Effect.Effect<T, RLSError | E> => {
  return Effect.acquireUseRelease(
    // Acquire: get client and start transaction
    Effect.gen(function* () {
      const client = yield* acquireClient(pool);
      yield* Effect.tryPromise({
        try: () => client.query("BEGIN"),
        catch: (error) => new RLSError({ cause: error, operation: "beginTransaction" }),
      });
      yield* setOrganizationContext(client, organizationId);
      return client;
    }),
    // Use: execute the operation
    (client) =>
      Effect.gen(function* () {
        const result = yield* operation(client);
        yield* Effect.tryPromise({
          try: () => client.query("COMMIT"),
          catch: (error) => new RLSError({ cause: error, operation: "commitTransaction" }),
        });
        return result;
      }),
    // Release: rollback on failure, always release client
    (client, exit) =>
      Effect.gen(function* () {
        if (exit._tag === "Failure") {
          yield* rollback(client);
        }
        yield* releaseClient(client);
      }),
  );
};
