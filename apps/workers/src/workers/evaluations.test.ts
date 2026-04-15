import {
  EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
  evaluationAlignmentRefreshWorkflowId,
  type WorkflowStarterShape,
} from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createEvaluationsWorker } from "./evaluations.ts"

describe("createEvaluationsWorker", () => {
  it("signals the refresh-loop workflow for evaluation alignment", async () => {
    const consumer = new TestQueueConsumer()
    const signaledWorkflows: Array<{
      readonly workflow: string
      readonly input: unknown
      readonly options: {
        readonly workflowId: string
        readonly signal: string
        readonly signalArgs?: readonly unknown[]
      }
    }> = []
    const workflowStarter: WorkflowStarterShape = {
      start: () => Effect.die("start should not be called by evaluations:align"),
      signalWithStart: (workflow, input, options) =>
        Effect.sync(() => {
          signaledWorkflows.push({ workflow, input, options })
        }),
    }

    createEvaluationsWorker({ consumer, workflowStarter })

    await consumer.dispatchTask("evaluations", "align", {
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "evaluation-1",
    })

    expect(signaledWorkflows).toEqual([
      {
        workflow: "evaluationAlignmentWorkflow",
        input: {
          organizationId: "org-1",
          projectId: "proj-1",
          issueId: "issue-1",
          evaluationId: "evaluation-1",
          jobId: "auto-refresh:evaluation-1",
          refreshLoop: true,
          reason: "debounced-metric-refresh",
        },
        options: {
          workflowId: evaluationAlignmentRefreshWorkflowId("evaluation-1"),
          signal: EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
          signalArgs: [
            {
              reason: "debounced-metric-refresh",
              jobId: "auto-refresh:evaluation-1",
            },
          ],
        },
      },
    ])
  })
})
