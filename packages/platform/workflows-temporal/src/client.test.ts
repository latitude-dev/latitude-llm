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
