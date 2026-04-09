import { createLogger } from "@repo/observability"

const logger = createLogger("workflows-flagger")

/**
 * Black-box async flagger interface.
 *
 * For this phase, all system queues use the same flagger contract.
 * The result is { matched: boolean }.
 *
 * Future work can:
 * - Add richer flagger payloads (confidence, explanation, evidence)
 * - Swap in queue-specific flagger implementations
 * - Add deterministic routing paths for specific queues
 */
export const runFlagger = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}): Promise<{ matched: boolean }> => {
  logger.info("Running flagger", {
    organizationId: input.organizationId,
    projectId: input.projectId,
    traceId: input.traceId,
    queueSlug: input.queueSlug,
  })

  return { matched: false }
}
