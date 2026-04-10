import {
  EVALUATION_ALIGNMENT_REFRESH_SIGNAL,
  evaluationAlignmentRefreshWorkflowId,
  type QueueConsumer,
  type QueueName,
  type TaskHandlers,
  type WorkflowStarterShape,
} from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createEvaluationsWorker } from "./evaluations.ts"

type AnyTaskHandlers = Record<string, (payload: unknown) => Effect.Effect<void, unknown>>

class TestQueueConsumer implements QueueConsumer {
  private readonly registered = new Map<QueueName, AnyTaskHandlers>()

  subscribe<T extends QueueName>(queue: T, handlers: TaskHandlers<T>): void {
    this.registered.set(queue, handlers as unknown as AnyTaskHandlers)
  }

  start() {
    return Effect.void
  }

  stop() {
    return Effect.void
  }

  async dispatchTask(queue: QueueName, task: string, payload: unknown): Promise<void> {
    const handlers = this.registered.get(queue)
    if (!handlers) throw new Error(`No handlers registered for queue ${queue}`)
    const handler = handlers[task]
    if (!handler) throw new Error(`No handler for task ${task} on queue ${queue}`)
    await Effect.runPromise(handler(payload))
  }
}

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
