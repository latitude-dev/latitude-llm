import { log, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const { runFlagger, draftAnnotate, persistAnnotation } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: defaultActivityRetryPolicy,
})

/**
 * Flagger workflow.
 *
 * Runs one async black-box flagger call for a specific trace and flagger.
 * When the flagger returns matched=true, the workflow proceeds to:
 * 1. Generate feedback via draftAnnotate (non-transactional LLM call)
 * 2. Persist a draft score via persistAnnotation (transactional)
 *
 * The workflow result distinguishes between:
 * - "annotated": matched and successfully wrote the draft score
 * - "not_matched": flagger did not match
 */
export const flaggerWorkflow = async (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerId: string
  readonly flaggerSlug: string
}) => {
  const startTime = Date.now()

  const result = await runFlagger({
    organizationId: input.organizationId,
    projectId: input.projectId,
    traceId: input.traceId,
    flaggerSlug: input.flaggerSlug,
  })

  if (result.matched) {
    log.info("Flagger matched, starting draft annotate", {
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      flaggerId: input.flaggerId,
      flaggerSlug: input.flaggerSlug,
    })

    const draftResult = await draftAnnotate({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      flaggerSlug: input.flaggerSlug,
    })

    log.info("Flagger draft annotate completed, starting persist", {
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      flaggerId: input.flaggerId,
      flaggerSlug: input.flaggerSlug,
    })

    const persistResult = await persistAnnotation({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      flaggerId: input.flaggerId,
      flaggerSlug: input.flaggerSlug,
      feedback: draftResult.feedback,
      traceCreatedAt: draftResult.traceCreatedAt,
      scoreId: draftResult.scoreId,
    })

    log.info("Flagger persist annotation completed", {
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      flaggerId: input.flaggerId,
      flaggerSlug: input.flaggerSlug,
      draftAnnotationId: persistResult.draftAnnotationId,
      wasCreated: persistResult.wasCreated,
    })

    return {
      action: "annotated" as const,
      flaggerId: input.flaggerId,
      flaggerSlug: input.flaggerSlug,
      traceId: input.traceId,
      draftAnnotationId: persistResult.draftAnnotationId,
      wasCreated: persistResult.wasCreated,
      durationMs: Date.now() - startTime,
    }
  }

  return {
    action: "not_matched" as const,
    flaggerId: input.flaggerId,
    flaggerSlug: input.flaggerSlug,
    traceId: input.traceId,
    durationMs: Date.now() - startTime,
  }
}
