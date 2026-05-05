import { WorkflowAlreadyStartedError } from "@domain/queue"
import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
import type { Client } from "@temporalio/client"
import { Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client"
import { Cause, Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { createTemporalClientEffect, createWorkflowStarter, TemporalConnectionError } from "./client.ts"

silenceLoggerInTests()

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
        expect(errOpt.value.message).toBe(
          "Failed to connect to Temporal at 127.0.0.1:7233 (namespace default): connection refused",
        )
      }
    }

    connectSpy.mockRestore()
  })

  it("falls back to the nested cause when Temporal returns an opaque message", async () => {
    const opaqueError = new Error("undefined undefined: undefined")
    opaqueError.cause = new Error("transport closed")
    const connectSpy = vi.spyOn(Connection, "connect").mockRejectedValue(opaqueError)

    const exit = await Effect.runPromise(
      Effect.exit(
        createTemporalClientEffect({
          address: "temporal.example:7233",
          namespace: "staging.ns",
          taskQueue: "workflows",
          apiKey: "secret",
        }),
      ),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      const errOpt = Cause.findErrorOption(exit.cause)
      expect(errOpt._tag).toBe("Some")
      if (errOpt._tag === "Some") {
        expect(errOpt.value).toBeInstanceOf(TemporalConnectionError)
        expect(errOpt.value.message).toBe(
          "Failed to connect to Temporal at temporal.example:7233 (namespace staging.ns): transport closed",
        )
      }
    }

    connectSpy.mockRestore()
  })
})

describe("createWorkflowStarter", () => {
  it("translates Temporal's WorkflowExecutionAlreadyStartedError into the tagged WorkflowAlreadyStartedError", async () => {
    // The contract changed: Temporal's class used to propagate as a defect,
    // forcing every caller to catch by `instanceof`. Now `start` surfaces a
    // tagged failure in the error channel so callers idempotency-key on
    // `workflowId` can `Effect.catchTag("WorkflowAlreadyStartedError", ...)`.
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
        expect(errOpt.value).toBeInstanceOf(WorkflowAlreadyStartedError)
        expect(errOpt.value).toMatchObject({
          _tag: "WorkflowAlreadyStartedError",
          workflow: "issueDiscoveryWorkflow",
          workflowId: "issue-discovery:org-1:proj-1:score-1",
        })
      }
    }
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(
      "issueDiscoveryWorkflow",
      expect.objectContaining({
        workflowId: "issue-discovery:org-1:proj-1:score-1",
        workflowIdConflictPolicy: "FAIL",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
      }),
    )
  })

  it("resolves when the start call opens a fresh execution", async () => {
    const start = vi.fn(async () => ({ firstExecutionRunId: "run-abc" }))
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
    expect(start).toHaveBeenCalledWith(
      "issueDiscoveryWorkflow",
      expect.objectContaining({
        workflowIdConflictPolicy: "FAIL",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
      }),
    )
  })
})
