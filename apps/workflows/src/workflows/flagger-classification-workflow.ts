import type { SessionHint } from "@domain/flaggers"
import { log, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const { classifySessionFlagger, draftSessionFlaggerAnnotation, saveSessionFlaggerAnnotation } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 seconds",
  retry: defaultActivityRetryPolicy,
})

export interface FlaggerClassificationWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerId: string
  readonly flaggerSlug: string
  readonly reason: "hinted" | "sampled"
  readonly hints: readonly SessionHint[]
}

/**
 * The LLM pass for one session×flagger: classify (hints in the prompt) →
 * draft (anchor dedup before billing) → save the published SYSTEM score.
 */
export const flaggerClassificationWorkflow = async (input: FlaggerClassificationWorkflowInput) => {
  const startTime = Date.now()

  const result = await classifySessionFlagger({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerSlug: input.flaggerSlug,
    hints: input.hints,
  })

  const logContext = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerId: input.flaggerId,
    flaggerSlug: input.flaggerSlug,
    reason: input.reason,
  }

  if (!result.matched) {
    return { result: "not_matched", durationMs: Date.now() - startTime }
  }

  log.info("Session flagger matched, drafting annotation", logContext)

  const draft = await draftSessionFlaggerAnnotation({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerSlug: input.flaggerSlug,
    contentHash: result.contentHash,
    latestTraceId: result.latestTraceId,
    ...(result.feedback !== undefined ? { feedback: result.feedback } : {}),
    ...(result.messageIndex !== undefined ? { messageIndex: result.messageIndex } : {}),
  })

  if (draft.status === "duplicate") {
    log.info("Session flagger match already annotated for this anchor", { ...logContext, scoreId: draft.scoreId })
    return { result: "duplicate", scoreId: draft.scoreId, durationMs: Date.now() - startTime }
  }

  await saveSessionFlaggerAnnotation({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerId: input.flaggerId,
    flaggerSlug: input.flaggerSlug,
    latestTraceId: result.latestTraceId,
    simulationId: result.simulationId,
    scoreId: draft.scoreId,
    feedback: draft.feedback,
    traceCreatedAt: result.sessionStartedAt,
    contentHash: result.contentHash,
    ...(draft.messageIndex !== undefined ? { messageIndex: draft.messageIndex } : {}),
    ...(result.flaggerTraceId !== undefined ? { flaggerTraceId: result.flaggerTraceId } : {}),
  })

  log.info("Session flagger annotation saved", { ...logContext, scoreId: draft.scoreId })

  return { result: "annotated", scoreId: draft.scoreId, durationMs: Date.now() - startTime }
}
