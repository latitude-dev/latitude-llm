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
        // One classification per session×slug at a time; a later generation
        // re-runs after the previous completes (default ALLOW_DUPLICATE).
        workflowId: `flagger-classification:${input.sessionId}:${classification.flaggerSlug}`,
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
          },
        ],
      })
      started++
    } catch (error) {
      if (isAlreadyStartedError(error)) {
        log.info("Flagger classification already running for this session×slug", {
          sessionId: input.sessionId,
          flaggerSlug: classification.flaggerSlug,
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
