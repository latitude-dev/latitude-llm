import type { WorkflowStarterShape } from "@domain/queue"
import { WorkflowAlreadyStartedError } from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createTraceDeletionsWorker } from "./trace-deletions.ts"

const payload = { organizationId: "org-1", projectId: "proj-1", traceDeletionRequestId: "req-1" }

const makeStarter = (start: WorkflowStarterShape["start"]): WorkflowStarterShape => ({
  start,
  signalWithStart: () => Effect.die("signalWithStart should not be called by the trace deletions worker"),
})

describe("createTraceDeletionsWorker", () => {
  it("starts one deleteTracesWorkflow per request", async () => {
    const consumer = new TestQueueConsumer()
    const started: unknown[] = []
    createTraceDeletionsWorker({
      consumer,
      workflowStarter: makeStarter((workflow, input, options) =>
        Effect.sync(() => {
          started.push({ workflow, input, options })
        }),
      ),
    })

    await consumer.dispatchTask("trace-deletions", "run", payload)

    expect(started).toEqual([
      { workflow: "deleteTracesWorkflow", input: payload, options: { workflowId: "trace-deletion:req-1" } },
    ])
  })

  it("treats an already-running deletion as success", async () => {
    const consumer = new TestQueueConsumer()
    createTraceDeletionsWorker({
      consumer,
      workflowStarter: makeStarter((workflow, _input, options) =>
        Effect.fail(new WorkflowAlreadyStartedError({ workflow, workflowId: options.workflowId })),
      ),
    })

    await expect(consumer.dispatchTask("trace-deletions", "run", payload)).resolves.not.toThrow()
  })
})
