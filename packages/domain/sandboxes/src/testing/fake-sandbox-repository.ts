import { Effect } from "effect"
import type { Sandbox } from "../entities/sandbox.ts"
import type { SandboxRepository } from "../ports/sandbox-repository.ts"

type SandboxRepositoryShape = (typeof SandboxRepository)["Service"]

export const createFakeSandboxRepository = (overrides?: Partial<SandboxRepositoryShape>) => {
  let stampCount = 0

  const repository: SandboxRepositoryShape = {
    findOptional: () => Effect.succeed<Sandbox | null>(null),
    stampActivity: () =>
      Effect.sync(() => {
        stampCount++
      }),
    ...overrides,
  }

  return {
    repository,
    get stampCount() {
      return stampCount
    },
  }
}
