import {
  ConcurrentSqlTransactionError,
  captureCallSite,
  OrganizationId,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { createLogger } from "@repo/observability"
import { sql } from "drizzle-orm"
import { Cause, Effect, Exit, Layer } from "effect"
import type { Operator, PostgresClient } from "./client.ts"

const sqlClientLogger = createLogger("db-postgres/sql-client")

/**
 * Live layer for SqlClient with closure-scoped transaction tracking.
 *
 * Each Layer.effect invocation creates a fresh SqlClient with its own
 * `activeTx` slot. When `transaction()` opens a real DB transaction it
 * stores the operator in `activeTx` so that every `query()` call within
 * that scope reuses the same connection — regardless of whether the
 * repository was constructed inside or outside the transaction.
 *
 * The inner effect runs in the parent fiber (via `Effect.exit`) so all
 * provided services (repositories, etc.) remain available inside the
 * transaction scope.
 *
 * **Concurrent transactions**: do NOT run two `transaction()` calls
 * concurrently on the same SqlClient instance (e.g. via `Effect.all` with
 * concurrency > 1). `activeTx` has no fiber identity, so concurrent
 * transactions will overwrite each other's operator and corrupt both
 * connections. Use separate `SqlClientLive` layer instances instead.
 * A concurrent call is detected at runtime and fails with ConcurrentSqlTransactionError.
 */
const setRlsContext = (tx: Operator, organizationId: OrganizationId) => {
  if (organizationId === "system") return Promise.resolve()
  return tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`)
}

export const SqlClientLive = (client: PostgresClient, organizationId: OrganizationId = OrganizationId("system")) =>
  Layer.effect(
    SqlClient,
    Effect.gen(function* () {
      let activeTx: Operator | null = null
      let txOpening = false

      return {
        organizationId,

        transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => {
          if (activeTx) return effect
          if (txOpening) {
            return Effect.fail(new ConcurrentSqlTransactionError({}))
          }

          txOpening = true
          const callSite = captureCallSite("SqlClient.transaction")

          return Effect.gen(function* () {
            let resolveTxReady!: (tx: Operator) => void
            let resolveEffectDone!: (result: { ok: true; value: A } | { ok: false; error: unknown }) => void

            const txReady = new Promise<Operator>((resolve) => {
              resolveTxReady = resolve
            })
            const effectDone = new Promise<{ ok: true; value: A } | { ok: false; error: unknown }>((resolve) => {
              resolveEffectDone = resolve
            })

            const txPromise = client.transaction(async (tx) => {
              await setRlsContext(tx as Operator, organizationId)
              resolveTxReady(tx as Operator)
              const result = await effectDone
              if (!result.ok) throw result.error
              return result.value
            })

            const tx = yield* Effect.tryPromise({
              try: () => txReady,
              catch: (e) => {
                txOpening = false
                return toRepositoryError(e, "transaction", callSite)
              },
            })

            // activeTx is set — nested transaction() calls now use pass-through.
            // Release txOpening so that sequential (non-concurrent) calls after
            // this transaction completes can open their own transactions.
            activeTx = tx
            txOpening = false
            const exit = yield* Effect.exit(effect)
            activeTx = null

            if (Exit.isSuccess(exit)) {
              resolveEffectDone({ ok: true, value: exit.value })
              yield* Effect.tryPromise({
                try: () => txPromise,
                catch: (e) => toRepositoryError(e, "transaction", callSite),
              })
              return exit.value
            }

            resolveEffectDone({ ok: false, error: exit.cause })
            // Wait for Drizzle's transaction promise so the connection returns to
            // the pool. The callback rethrows `exit.cause`, so this promise
            // usually rejects with that same value — we still propagate the
            // Effect failure via `exit` below. If the driver reports a distinct
            // error (e.g. rollback/commit), log it so production is not blind.
            yield* Effect.tryPromise({
              try: () =>
                txPromise.catch((transactionCompletionError: unknown) => {
                  if (transactionCompletionError !== exit.cause) {
                    sqlClientLogger.error(
                      "[SqlClient] Database error while completing transaction after effect failure",
                      { effectFailure: Cause.squash(exit.cause), transactionCompletionError },
                    )
                  }
                }),
              catch: (e) => toRepositoryError(e, "transaction", callSite),
            })
            return yield* exit
          })
        },

        query: <T>(fn: (tx: Operator, organizationId: OrganizationId) => Promise<T>) => {
          const callSite = captureCallSite("SqlClient.query")
          return Effect.gen(function* () {
            const currentTx = activeTx
            if (currentTx) {
              return yield* Effect.tryPromise({
                try: () => fn(currentTx, organizationId),
                catch: (error) => toRepositoryError(error, "query", callSite),
              })
            }

            return yield* Effect.tryPromise({
              try: () =>
                client.transaction(async (tx) => {
                  await setRlsContext(tx as Operator, organizationId)
                  return fn(tx as Operator, organizationId)
                }),
              catch: (error) => toRepositoryError(error, "query", callSite),
            })
          })
        },
      } satisfies SqlClientShape<Operator>
    }),
  )
