import { Effect } from "effect"
import { type DistributedLockRepositoryShape, DistributedLockUnavailableError } from "../distributed-lock.ts"

export const createFakeDistributedLockRepository = (overrides?: Partial<DistributedLockRepositoryShape>) => {
  const heldLocks = new Set<string>()

  const repository: DistributedLockRepositoryShape = {
    withLock: <A, E, R>({ key }: { readonly key: string }, effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        if (heldLocks.has(key)) {
          return yield* new DistributedLockUnavailableError({ key })
        }
        heldLocks.add(key)
        try {
          return yield* effect
        } finally {
          heldLocks.delete(key)
        }
      }),
    ...overrides,
  }

  return { repository, heldLocks }
}
