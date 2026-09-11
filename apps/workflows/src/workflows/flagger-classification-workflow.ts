import type { ClassifySessionFlaggerResult, FlaggerScreeningSelection, SessionHint } from "@domain/flaggers"
import { log, proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const {
  classifySessionFlagger,
  draftSessionFlaggerAnnotation,
  saveSessionFlaggerAnnotation,
  saveSessionFlaggerVerdict,
} = proxyActivities<typeof activities>({
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
  readonly screeningSelection?: FlaggerScreeningSelection | undefined
}

type ScoringVerdictResult = Extract<ClassifySessionFlaggerResult, { readonly outcome: "success" | "failure" }>

const isScoringVerdict = (result: ClassifySessionFlaggerResult): result is ScoringVerdictResult =>
  result.outcome === "success" || result.outcome === "failure"

/**
 * The LLM pass for one session×flagger: classify (hints in the prompt) → save
 * the published SYSTEM score. A detection match drafts first, for the anchor
 * dedup that precedes billing; a holistic verdict saves directly.
 *
 * The verdict branch needs no `patched()`: a replaying execution restores a
 * classify result written before `outcome` existed, so the guard is false and
 * the command sequence is the one its history already records.
 */
export const flaggerClassificationWorkflow = async (input: FlaggerClassificationWorkflowInput) => {
  const startTime = Date.now()

  const analysisHash = input.screeningSelection?.analysisHash
  const result = await classifySessionFlagger({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerSlug: input.flaggerSlug,
    hints: input.hints,
    ...(analysisHash !== undefined ? { analysisHash } : {}),
    ...(input.screeningSelection ? { screeningSelection: input.screeningSelection } : {}),
  })

  const logContext = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerId: input.flaggerId,
    flaggerSlug: input.flaggerSlug,
    reason: input.reason,
  }

  // Both scoring verdicts persist in one step. A verdict already carries its
  // own feedback, and its dedup is per analysis generation rather than per
  // anchor, so the draft step would add an LLM fallback that never fires and a
  // dedup rule that would drop a re-judged session's new verdict.
  if (isScoringVerdict(result)) {
    const feedback = result.feedback
    if (analysisHash === undefined || feedback === undefined) {
      log.warn("Skipping flagger verdict with no analysis generation or feedback", logContext)
      return { result: "skipped_verdict", durationMs: Date.now() - startTime }
    }

    await saveSessionFlaggerVerdict({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      flaggerSlug: input.flaggerSlug,
      verdict: result.outcome,
      feedback,
      latestTraceId: result.latestTraceId,
      simulationId: result.simulationId,
      contentHash: result.contentHash,
      analysisHash,
      scoringArtifactVersion: result.scoringArtifactVersion,
      ...(result.messageIndex !== undefined ? { messageIndex: result.messageIndex } : {}),
      ...(result.flaggerTraceId !== undefined ? { flaggerTraceId: result.flaggerTraceId } : {}),
    })

    log.info("Session flagger verdict saved", { ...logContext, verdict: result.outcome })
    return { result: `verdict_${result.outcome}`, durationMs: Date.now() - startTime }
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
    scoringArtifactVersion: result.scoringArtifactVersion,
    ...(draft.messageIndex !== undefined ? { messageIndex: draft.messageIndex } : {}),
    ...(result.flaggerTraceId !== undefined ? { flaggerTraceId: result.flaggerTraceId } : {}),
  })

  log.info("Session flagger annotation saved", { ...logContext, scoreId: draft.scoreId })

  return { result: "annotated", scoreId: draft.scoreId, durationMs: Date.now() - startTime }
}
