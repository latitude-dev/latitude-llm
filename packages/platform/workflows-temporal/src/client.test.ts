import { WorkflowStartError } from "@domain/queue"
import type { Client } from "@temporalio/client"
import { Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { Cause, Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { createTemporalClientEffect, createWorkflowStarter, TemporalConnectionError } from "./client.ts"

describe("createTemporalClientEffect", () => {
  it("maps connection failures to TemporalConnectionError", async () => {
    const connectSpy = vi.spyOn(Connection, "connect").mockRejectedValue(new Error("connection refused"))

    const exit = await Effect.runPromise(
      Effect.exit(
        createTemporalClientEffect({
          address: "127.0.0.1:7233",
          namespace: "default",
          taskQueue: "workflows",
        }),
      ),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const errOpt = Cause.findErrorOption(exit.cause)
      expect(errOpt._tag).toBe("Some")
      if (errOpt._tag === "Some") {
        expect(errOpt.value).toBeInstanceOf(TemporalConnectionError)
        expect(errOpt.value.message).toBe("connection refused")
      }
    }

    connectSpy.mockRestore()
  })
})

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

  it("maps unexpected start errors to WorkflowStartError", async () => {
    const start = vi.fn(async () => {
      throw new Error("grpc unavailable")
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

    const exit = await Effect.runPromise(
      Effect.exit(
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
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const errOpt = Cause.findErrorOption(exit.cause)
      expect(errOpt._tag).toBe("Some")
      if (errOpt._tag === "Some") {
        expect(errOpt.value).toBeInstanceOf(WorkflowStartError)
        expect((errOpt.value as WorkflowStartError).workflowId).toBe("issue-discovery:org-1:proj-1:score-1")
      }
    }
    expect(start).toHaveBeenCalledTimes(1)
  })
})
