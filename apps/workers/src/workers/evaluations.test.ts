import type { WorkflowStarterShape } from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createEvaluationsWorker } from "./evaluations.ts"

type StartedWorkflow = {
  readonly workflow: string
  readonly input: unknown
  readonly options: { readonly workflowId: string }
}

const makeRecordingStarter = (overrides?: {
  readonly start?: WorkflowStarterShape["start"]
}): { starter: WorkflowStarterShape; started: StartedWorkflow[] } => {
  const started: StartedWorkflow[] = []
  const starter: WorkflowStarterShape = {
    start:
      overrides?.start ??
      ((workflow, input, options) =>
        Effect.sync(() => {
          started.push({ workflow, input, options })
        })),
    signalWithStart: () => Effect.die("signalWithStart should not be called by evaluations worker"),
  }
  return { starter, started }
}

describe("createEvaluationsWorker", () => {
  it("starts refreshEvaluationAlignmentWorkflow on automaticRefreshAlignment with a deterministic workflowId", async () => {
    const consumer = new TestQueueConsumer()
    const { starter, started } = makeRecordingStarter()
    createEvaluationsWorker({ consumer, workflowStarter: starter })

    await consumer.dispatchTask("evaluations", "automaticRefreshAlignment", {
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "evaluation-1",
    })

    expect(started).toEqual([
      {
        workflow: "refreshEvaluationAlignmentWorkflow",
        input: {
          organizationId: "org-1",
          projectId: "proj-1",
          issueId: "issue-1",
          evaluationId: "evaluation-1",
        },
        options: { workflowId: "evaluations:refreshAlignment:evaluation-1" },
      },
    ])
  })

  it("starts optimizeEvaluationWorkflow on automaticOptimization with a deterministic workflowId", async () => {
    const consumer = new TestQueueConsumer()
    const { starter, started } = makeRecordingStarter()
    createEvaluationsWorker({ consumer, workflowStarter: starter })

    await consumer.dispatchTask("evaluations", "automaticOptimization", {
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-1",
      evaluationId: "evaluation-1",
    })

    expect(started).toEqual([
      {
        workflow: "optimizeEvaluationWorkflow",
        input: {
          organizationId: "org-1",
          projectId: "proj-1",
          issueId: "issue-1",
          evaluationId: "evaluation-1",
          jobId: "auto-optimize:evaluation-1",
          billingOperationId: expect.any(String),
        },
        options: { workflowId: "evaluations:optimize:evaluation-1" },
      },
    ])
  })

  it("swallows WorkflowExecutionAlreadyStartedError so a duplicate delayed job does not re-queue", async () => {
    const consumer = new TestQueueConsumer()
    const alreadyStarted = Object.assign(new Error("already started"), {
      name: "WorkflowExecutionAlreadyStartedError",
    })
    const { starter } = makeRecordingStarter({
      start: () => Effect.die(alreadyStarted),
    })
    createEvaluationsWorker({ consumer, workflowStarter: starter })

    await expect(
      consumer.dispatchTask("evaluations", "automaticRefreshAlignment", {
        organizationId: "org-1",
        projectId: "proj-1",
        issueId: "issue-1",
        evaluationId: "evaluation-1",
      }),
    ).resolves.toBeUndefined()
  })
})
