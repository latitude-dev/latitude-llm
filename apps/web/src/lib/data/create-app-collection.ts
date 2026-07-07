import { createCollection, getActiveTransaction } from "@tanstack/react-db"
import { handleMutationError } from "./handle-mutation-error.ts"

/** The slice of a TanStack DB transaction the error routing relies on. */
interface MutationTransaction {
  readonly isPersisted: { readonly promise: Promise<unknown> }
}

export const MUTATOR_METHODS = ["insert", "update", "delete"] as const

/**
 * Wraps a collection mutation transaction so an un-awaited persistence failure
 * routes to {@link handleMutationError} instead of becoming an unhandled promise
 * rejection. Stays out of the way when the caller observes the transaction
 * itself: reading `.isPersisted` marks the error as caller-owned (forms via
 * `createFormSubmitHandler`, modals awaiting `tx.isPersisted.promise`), so the
 * central handler never double-toasts what the caller already surfaces.
 */
function routeTransactionErrors<T extends MutationTransaction>(tx: T): T {
  let ownedByCaller = false

  void tx.isPersisted.promise.catch((error: unknown) => {
    if (!ownedByCaller) handleMutationError(error)
  })

  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === "isPersisted") ownedByCaller = true
      return Reflect.get(target, prop, receiver)
    },
  })
}

/**
 * `createCollection` with central mutation error handling wired in. Behaves
 * exactly like `createCollection`, but decorates `insert`/`update`/`delete` so
 * each transaction's rejection reaches {@link handleMutationError} — closing the
 * unhandled-rejection gap TanStack DB leaves (`@tanstack/db` exposes no
 * global/collection `onError`; mutation errors surface only via
 * `tx.isPersisted.promise`). Mutations that join an ambient transaction (e.g. a
 * `createOptimisticAction` `onMutate`) are left untouched — the ambient
 * transaction's owner handles its errors.
 */
export const createAppCollection = ((options: unknown) => {
  const collection = (createCollection as unknown as (o: unknown) => Record<string, unknown>)(options)

  for (const method of MUTATOR_METHODS) {
    const original = collection[method]
    if (typeof original !== "function") continue

    const mutate = original as (...args: unknown[]) => unknown
    collection[method] = (...args: unknown[]) => {
      const transaction = Reflect.apply(mutate, collection, args)
      if (getActiveTransaction()) return transaction
      return routeTransactionErrors(transaction as MutationTransaction)
    }
  }

  return collection
}) as unknown as typeof createCollection
