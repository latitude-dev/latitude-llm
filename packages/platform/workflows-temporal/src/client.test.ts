import type { Client } from "@temporalio/client"
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { createWorkflowStarter } from "./client.ts"

describe("createWorkflowStarter", () => {
  it("treats duplicate workflow starts as a successful no-op", async () => {
    const start = vi.fn(async () => {
      throw Object.create(WorkflowExecutionAlreadyStartedError.prototype)
    })
    const client = {
      workflow: {
        start,
      },
    } as unknown as Client

    const starter = createWorkflowStarter(client, {
      address: "127.0.0.1:7233",
      namespace: "default",
      taskQueue: "workflows",
    })

    await expect(
      Effect.runPromise(
        starter.start(
          "issueDiscoveryWorkflow",
          {
            organizationId: "org-1",
            projectId: "proj-1",
            scoreId: "score-1",
          },
          { workflowId: "issue-discovery:org-1:proj-1:score-1" },
        ),
      ),
    ).resolves.toBeUndefined()
    expect(start).toHaveBeenCalledTimes(1)
  })
})
