import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

const { runFlagger } = proxyActivities<typeof activities>({ startToCloseTimeout: "30 seconds" })

/**
 * System queue flagger workflow.
 *
 * Runs one async black-box flagger call for a specific trace and queue.
 * The flagger result is { matched: boolean }.
 *
 * Positive matches intentionally stop at a TODO until the team decides
 * how queue items and draft annotations should be written.
 */
export const systemQueueFlaggerWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}) => {
  const startTime = Date.now()

  // TODO: The precise flagger-facing payload should be revisited later.
  // For now, we pass minimal context and expect a { matched: boolean } result.
  const result = await runFlagger({
    organizationId: input.organizationId,
    projectId: input.projectId,
    traceId: input.traceId,
    queueSlug: input.queueSlug,
  })

  if (result.matched) {
    // TODO: Positive flagger matches intentionally stop here in this phase.
    // Future work will decide whether to create queue items, draft annotations, or both.
    // This is the extension point for write-side behavior.
  }

  return {
    action: result.matched ? "matched" : ("not_matched" as const),
    queueSlug: input.queueSlug,
    traceId: input.traceId,
    durationMs: Date.now() - startTime,
  }
}
