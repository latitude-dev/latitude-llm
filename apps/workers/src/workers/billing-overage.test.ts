import type { WorkflowStarterShape } from "@domain/queue"
import { WorkflowAlreadyStartedError } from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createBillingOverageWorker } from "./billing-overage.ts"

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
    signalWithStart: () => Effect.die("signalWithStart should not be called by billing overage worker"),
  }
  return { starter, started }
}

describe("createBillingOverageWorker", () => {
  it("starts billingOverageWorkflow with a snapshot-specific deterministic workflowId", async () => {
    const consumer = new TestQueueConsumer()
    const { starter, started } = makeRecordingStarter()
    createBillingOverageWorker({ consumer, workflowStarter: starter })

    await consumer.dispatchTask("billing-overage", "reportOverage", {
      organizationId: "org-1",
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-06-01T00:00:00.000Z",
      snapshotOverageCredits: 123,
    })

    expect(started).toEqual([
      {
        workflow: "billingOverageWorkflow",
        input: {
          organizationId: "org-1",
          periodStart: "2026-05-01T00:00:00.000Z",
          periodEnd: "2026-06-01T00:00:00.000Z",
          snapshotOverageCredits: 123,
        },
        options: {
          workflowId: "billing-overage:org-1:2026-05-01T00:00:00.000Z:2026-06-01T00:00:00.000Z:123",
        },
      },
    ])
  })

  it("treats an already-running workflow as success", async () => {
    const consumer = new TestQueueConsumer()
    const { starter } = makeRecordingStarter({
      start: (workflow, _input, options) =>
        Effect.fail(new WorkflowAlreadyStartedError({ workflow, workflowId: options.workflowId })),
    })
    createBillingOverageWorker({ consumer, workflowStarter: starter })

    await expect(
      consumer.dispatchTask("billing-overage", "reportOverage", {
        organizationId: "org-1",
        periodStart: "2026-05-01T00:00:00.000Z",
        periodEnd: "2026-06-01T00:00:00.000Z",
        snapshotOverageCredits: 123,
      }),
    ).resolves.toBeUndefined()
  })
})
