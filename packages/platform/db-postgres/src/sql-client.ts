import { OrganizationId, SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { sql } from "drizzle-orm"
import { Cause, Context, Effect, Exit, Layer } from "effect"
import type { Operator, PostgresClient } from "./client.ts"

const sqlClientLogger = createLogger("db-postgres/sql-client")

class ActiveSqlTransaction extends Context.Service<ActiveSqlTransaction, { readonly tx: Operator }>()(
  "@platform/db-postgres/ActiveSqlTransaction",
) {}

/**
 * Live layer for SqlClient with fiber-local transaction tracking.
 *
 * When `transaction()` opens a real DB transaction it provides the operator
 * through the current Effect context, so every `query()` call within that
 * transaction scope reuses the same connection. Nested transactions in the
 * same fiber are pass-through, while concurrent sibling fibers without that
 * context open independent DB transactions instead of sharing mutable state.
 *
 * The inner effect runs in the parent fiber (via `Effect.exit`) so all
 * provided services (repositories, etc.) remain available inside the
 * transaction scope.
 */
const setTransactionContext = async (tx: Operator, organizationId: OrganizationId) => {
  // Keep `latitude` first so unqualified extension types installed by migrations
  // (notably pgvector's `vector`) resolve in application queries. Keep `public`
  // second for test environments and standard extension installs.
  await tx.execute(sql`select set_config('search_path', 'latitude, public', true)`)

  if (organizationId === "system") return
  await tx.execute(sql`select set_config('app.current_organization_id', ${organizationId}, true)`)
}

export const SqlClientLive = (client: PostgresClient, organizationId: OrganizationId = OrganizationId("system")) =>
  Layer.effect(
    SqlClient,
    Effect.gen(function* () {
      return {
        organizationId,

        transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.withFiber((fiber) => {
            if (fiber.context.mapUnsafe.has(ActiveSqlTransaction.key)) return effect

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
                await setTransactionContext(tx as Operator, organizationId)
                resolveTxReady(tx as Operator)
                const result = await effectDone
                if (!result.ok) throw result.error
                return result.value
              })

              const tx = yield* Effect.tryPromise({
                try: () => txReady,
                catch: (e) => toRepositoryError(e, "transaction"),
              })

              const exit = yield* Effect.exit(Effect.provideService(effect, ActiveSqlTransaction, { tx }))

              if (Exit.isSuccess(exit)) {
                resolveEffectDone({ ok: true, value: exit.value })
                yield* Effect.tryPromise({
                  try: () => txPromise,
                  catch: (e) => toRepositoryError(e, "transaction"),
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
                catch: (e) => toRepositoryError(e, "transaction"),
              })
              return yield* exit
            })
          }),

        query: <T>(fn: (tx: Operator, organizationId: OrganizationId) => Promise<T>) =>
          Effect.withFiber((fiber) => {
            if (fiber.context.mapUnsafe.has(ActiveSqlTransaction.key)) {
              const { tx } = fiber.context.mapUnsafe.get(ActiveSqlTransaction.key) as { readonly tx: Operator }
              return Effect.tryPromise({
                try: () => fn(tx, organizationId),
                catch: (error) => toRepositoryError(error, "query"),
              })
            }

            return Effect.tryPromise({
              try: () =>
                client.transaction(async (tx) => {
                  await setTransactionContext(tx as Operator, organizationId)
                  return fn(tx as Operator, organizationId)
                }),
              catch: (error) => toRepositoryError(error, "query"),
            })
          }),
      } satisfies SqlClientShape<Operator>
    }),
  )
