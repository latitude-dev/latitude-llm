import type { Collection } from "@tanstack/react-db"
import { beforeEach, describe, expect, it, vi } from "vitest"

type TransactionReturningKeys = {
  [K in keyof Collection]-?: NonNullable<Collection[K]> extends (...args: never[]) => infer R
    ? R extends { isPersisted: unknown }
      ? K
      : never
    : never
}[keyof Collection] &
  string

type Exhaustive<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

const handleMutationErrorMock = vi.hoisted(() => vi.fn())
vi.mock("./handle-mutation-error.ts", () => ({ handleMutationError: handleMutationErrorMock }))

const dbState = vi.hoisted(() => ({
  collection: null as Record<string, unknown> | null,
  activeTransaction: undefined as unknown,
}))
vi.mock("@tanstack/react-db", () => ({
  createCollection: () => dbState.collection,
  getActiveTransaction: () => dbState.activeTransaction,
}))

import { createAppCollection, type MUTATOR_METHODS } from "./create-app-collection.ts"

type Tx = { isPersisted: { promise: Promise<unknown> }; readonly id: string }

const makeTransaction = (): { tx: Tx; reject: (error: unknown) => void } => {
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((_resolve, rejectFn) => {
    reject = rejectFn
  })
  return { tx: { id: "tx-1", isPersisted: { promise } }, reject }
}

const build = (methods: Record<string, () => Tx>) => {
  dbState.collection = methods
  return (createAppCollection as unknown as (options: unknown) => Record<string, (...args: unknown[]) => Tx>)({})
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("createAppCollection", () => {
  beforeEach(() => {
    handleMutationErrorMock.mockClear()
    dbState.activeTransaction = undefined
  })

  it("routes an un-awaited transaction rejection to handleMutationError", async () => {
    const { tx, reject } = makeTransaction()
    const collection = build({ insert: () => tx })

    collection.insert({})
    reject(new Error("persist failed"))
    await flush()

    expect(handleMutationErrorMock).toHaveBeenCalledTimes(1)
    expect(handleMutationErrorMock).toHaveBeenCalledWith(expect.any(Error))
  })

  it("does not route when the caller observes the transaction (reads isPersisted)", async () => {
    const { tx, reject } = makeTransaction()
    const collection = build({ update: () => tx })

    const returned = collection.update("id")
    const observed = returned.isPersisted.promise.catch(() => {})
    reject(new Error("persist failed"))
    await observed
    await flush()

    expect(handleMutationErrorMock).not.toHaveBeenCalled()
  })

  it("skips mutations that join an ambient transaction and returns it untouched", async () => {
    const { tx, reject } = makeTransaction()
    tx.isPersisted.promise.catch(() => {})
    dbState.activeTransaction = { id: "ambient" }
    const collection = build({ delete: () => tx })

    const returned = collection.delete("id")
    expect(returned).toBe(tx)

    reject(new Error("persist failed"))
    await flush()

    expect(handleMutationErrorMock).not.toHaveBeenCalled()
  })

  it("forwards the transaction so its own fields remain reachable through the proxy", () => {
    const { tx } = makeTransaction()
    tx.isPersisted.promise.catch(() => {})
    const collection = build({ insert: () => tx })

    const returned = collection.insert({})
    expect(returned.id).toBe("tx-1")
  })

  it("calls the original mutator with the collection as receiver (preserves `this`)", () => {
    const { tx } = makeTransaction()
    tx.isPersisted.promise.catch(() => {})
    let receiver: unknown
    const collection = build({
      insert(this: unknown) {
        receiver = this
        return tx
      },
    })

    collection.insert({})
    expect(receiver).toBe(collection)
  })

  it("MUTATOR_METHODS covers every transaction-returning collection method", () => {
    const exhaustive: Exhaustive<(typeof MUTATOR_METHODS)[number], TransactionReturningKeys> = true
    expect(exhaustive).toBe(true)
  })
})
