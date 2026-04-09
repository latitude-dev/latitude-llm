import { log, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

const { runFlagger, runAnnotate } = proxyActivities<typeof activities>({ startToCloseTimeout: "30 seconds" })

/**
 * System queue flagger workflow.
 *
 * Runs one async black-box flagger call for a specific trace and queue.
 * When the flagger returns matched=true, the workflow proceeds to create
 * a queue item and draft annotation via the annotate activity.
 *
 * The workflow result distinguishes between:
 * - "annotated": matched and successfully created queue item + draft annotation
 * - "matched": matched but annotate failed (will retry via Temporal)
 * - "not_matched": flagger did not match
 */
export const systemQueueFlaggerWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}) => {
  const startTime = Date.now()

  const result = await runFlagger({
    organizationId: input.organizationId,
    projectId: input.projectId,
    traceId: input.traceId,
    queueSlug: input.queueSlug,
  })

  if (result.matched) {
    log.info("System queue flagger matched, starting annotate", {
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      queueSlug: input.queueSlug,
    })

    const annotateResult = await runAnnotate({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      queueSlug: input.queueSlug,
    })

    log.info("System queue annotate completed", {
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      queueSlug: input.queueSlug,
      queueId: annotateResult.queueId,
      draftAnnotationId: annotateResult.draftAnnotationId,
      wasCreated: annotateResult.wasCreated,
    })

    return {
      action: "annotated" as const,
      queueSlug: input.queueSlug,
      traceId: input.traceId,
      queueId: annotateResult.queueId,
      draftAnnotationId: annotateResult.draftAnnotationId,
      wasCreated: annotateResult.wasCreated,
      durationMs: Date.now() - startTime,
    }
  }

  return {
    action: "not_matched" as const,
    queueSlug: input.queueSlug,
    traceId: input.traceId,
    durationMs: Date.now() - startTime,
  }
}
