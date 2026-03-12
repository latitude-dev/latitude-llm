import { OrganizationId, type RepositoryError, SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { sql } from "drizzle-orm"
import { Cause, Effect, Exit, Layer } from "effect"
import type { Operator, PostgresClient } from "./client.ts"
import { isTransactionDb } from "./client.ts"

/**
 * Helper to create a transaction SqlClient for nested effects.
 *
 * When already inside a transaction:
 * - transaction() calls just pass through (no nested transaction needed)
 */
const createTxSqlClient = (tx: Operator, organizationId: OrganizationId): SqlClientShape => ({
  organizationId,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: <T>(fn: (tx: Operator, organizationId: OrganizationId) => Promise<T>) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () => fn(tx, organizationId),
        catch: (error) => toRepositoryError(error, "query"),
      })
      return result
    }),
})

/**
 * Live layer for SqlClient that creates an RLS-enabled transaction.
 */
export const SqlClientLive = (client: PostgresClient, organizationId: OrganizationId = OrganizationId("system")) =>
  Layer.effect(
    SqlClient,
    Effect.gen(function* () {
      return {
        organizationId,
        transaction: Effect.fn(<A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.callback<A, E | RepositoryError, R | SqlClient>((resume) => {
            client
              .transaction(async (tx) => {
                await tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`)

                const txClient = createTxSqlClient(tx, organizationId)

                // Run the effect with the transaction db
                const exit = await Effect.runPromiseExit(
                  Effect.provideService(effect, SqlClient, txClient) as Effect.Effect<A, E, never>,
                )

                if (Exit.isSuccess(exit)) {
                  return exit.value
                }

                // Capture domain error so we can re-surface it after the Promise boundary.
                // We must throw here to trigger transaction rollback.
                const failReasons = exit.cause.reasons.filter(Cause.isFailReason)
                if (failReasons.length > 0) {
                  throw failReasons[0].error
                }
                throw new Error("_transaction_domain_failure_")
              })
              .then((value: A) => resume(Effect.succeed(value)))
              .catch((e: unknown) => {
                resume(Effect.fail(toRepositoryError(e, "transaction")))
              })
          }),
        ),

        query: <T>(fn: (tx: Operator, organizationId: OrganizationId) => Promise<T>) =>
          Effect.gen(function* () {
            if (isTransactionDb(client.db)) {
              const result = yield* Effect.tryPromise({
                try: () => fn(client.db as Operator, organizationId),
                catch: (error) => toRepositoryError(error, "withRLS"),
              })
              return result
            }

            return yield* Effect.tryPromise({
              try: async () => {
                return await client.transaction(async (tx) => {
                  await tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`)
                  return fn(tx as Operator, organizationId)
                })
              },
              catch: (error) => toRepositoryError(error, "withRLS"),
            })
          }),
      }
    }),
  )
