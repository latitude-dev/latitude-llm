import { log, ParentClosePolicy, proxyActivities, startChild } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { flaggerClassificationWorkflow } from "./flagger-classification-workflow.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

const { screenSessionFlaggers } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: defaultActivityRetryPolicy,
})

export interface FlaggerScreeningWorkflowInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly analysisHash: string
}

const isAlreadyStartedError = (error: unknown): boolean =>
  error instanceof Error && error.name === "WorkflowExecutionAlreadyStartedError"

/**
 * The deterministic pass for one session generation, chained after moments.
 * The activity does all the work; the workflow starts one detached
 * classification child per surviving request.
 */
export const flaggerScreeningWorkflow = async (input: FlaggerScreeningWorkflowInput) => {
  const screening = await screenSessionFlaggers(input)

  let started = 0
  for (const classification of screening.classifications) {
    try {
      await startChild(flaggerClassificationWorkflow, {
        // One classification per session×slug×generation so a newer screen can
        // start while a prior generation's classification is still running.
        workflowId: `flagger-classification:${input.sessionId}:${classification.flaggerSlug}:${input.analysisHash.slice(0, 16)}`,
        parentClosePolicy: ParentClosePolicy.ABANDON,
        args: [
          {
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            flaggerId: classification.flaggerId,
            flaggerSlug: classification.flaggerSlug,
            reason: classification.reason,
            hints: screening.hints,
            screeningSelection: classification.screeningSelection,
          },
        ],
      })
      started++
    } catch (error) {
      if (isAlreadyStartedError(error)) {
        log.info("Flagger classification already running for this session×slug×generation", {
          sessionId: input.sessionId,
          flaggerSlug: classification.flaggerSlug,
          analysisHash: input.analysisHash,
        })
        continue
      }
      throw error
    }
  }

  return {
    skipped: screening.skipped ?? null,
    decisions: screening.decisions.length,
    classificationsRequested: screening.classifications.length,
    classificationsStarted: started,
  }
}
