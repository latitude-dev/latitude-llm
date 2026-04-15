import { hash } from "@repo/utils"
import { Effect } from "effect"

export const deterministicSampling = async (input: {
  readonly sampling: number
  readonly keyParts: readonly string[]
}): Promise<boolean> => {
  if (input.sampling <= 0) {
    return false
  }

  if (input.sampling >= 100) {
    return true
  }

  const hashResult = await Effect.runPromise(hash(input.keyParts.join(":")))
  const hashPrefix = Number.parseInt(hashResult.slice(0, 8), 16)
  const normalized = (hashPrefix % 10_000) / 100

  return normalized < input.sampling
}
