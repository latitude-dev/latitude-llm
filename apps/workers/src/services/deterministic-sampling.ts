import { hash } from "@repo/utils"
import { Effect } from "effect"

/**
 * Deterministic sampling decision based on a hash of the input parameters.
 *
 * The decision is consistent for the same (organizationId, projectId, traceId, queueSlug)
 * combination and sampling percentage. This ensures retries and duplicates behave consistently.
 *
 * Uses MDN-compatible SHA-256 via Web Crypto API (through @repo/utils hash function).
 *
 * @returns Promise that resolves to true if the trace should be sampled in for this queue
 */
export const deterministicSampling = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
  readonly sampling: number
}): Promise<boolean> => {
  if (input.sampling <= 0) return false
  if (input.sampling >= 100) return true

  const hashInput = `${input.organizationId}:${input.projectId}:${input.traceId}:${input.queueSlug}`
  const hashResult = await Effect.runPromise(hash(hashInput))

  const hashPrefix = Number.parseInt(hashResult.slice(0, 8), 16)
  const normalized = (hashPrefix % 10000) / 100

  return normalized < input.sampling
}
