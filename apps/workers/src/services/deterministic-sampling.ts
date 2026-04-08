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
  // Edge case: 0% sampling means never include
  if (input.sampling <= 0) return false

  // Edge case: 100% sampling means always include
  if (input.sampling >= 100) return true

  // Create a deterministic hash from the identity components
  const hashInput = `${input.organizationId}:${input.projectId}:${input.traceId}:${input.queueSlug}`

  // Use MDN-compatible SHA-256 via Web Crypto API through @repo/utils
  const hashResult = await Effect.runPromise(hash(hashInput))

  // Convert first 8 hex chars to number and normalize to [0, 100)
  const hashPrefix = Number.parseInt(hashResult.slice(0, 8), 16)
  const normalized = (hashPrefix % 10000) / 100

  // Include if the normalized value is less than the sampling percentage
  return normalized < input.sampling
}
