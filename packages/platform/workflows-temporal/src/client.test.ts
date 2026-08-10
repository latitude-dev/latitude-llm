import { WorkflowAlreadyStartedError } from "@domain/queue"
import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
import type { Client } from "@temporalio/client"
import { Connection, WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from "@temporalio/client"
import { Cause, Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import {
  createTemporalClientEffect,
  createWorkflowStarter,
  createWorkflowTerminator,
  resolveWorkflowFailureReason,
  TemporalConnectionError,
} from "./client.ts"

silenceLoggerInTests()

describe("resolveWorkflowFailureReason", () => {
  it("unwraps Temporal's wrapper chain to the innermost activity failure message", () => {
    // Mirrors WorkflowFailedError -> ActivityFailure -> ApplicationFailure.
    const applicationFailure = new Error(
      'Cannot generate an evaluation for signal "X": at least 1 of its traces must be annotated by a human first.',
    )
    const activityFailure = new Error("Activity task failed", { cause: applicationFailure })
    const workflowFailure = new Error("Workflow execution failed", { cause: activityFailure })

    expect(resolveWorkflowFailureReason(workflowFailure)).toBe(
      'Cannot generate an evaluation for signal "X": at least 1 of its traces must be annotated by a human first.',
    )
  })

  it("keeps the last meaningful message when the innermost error has none", () => {
    const inner = new Error("", { cause: undefined })
    const outer = new Error("the real reason", { cause: inner })

    expect(resolveWorkflowFailureReason(outer)).toBe("the real reason")
  })

  it("returns null for a non-error value", () => {
    expect(resolveWorkflowFailureReason(undefined)).toBeNull()
  })
})

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
          "signalDiscoveryWorkflow",
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
          workflow: "signalDiscoveryWorkflow",
          workflowId: "issue-discovery:org-1:proj-1:score-1",
        })
      }
    }
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith(
      "signalDiscoveryWorkflow",
      expect.objectContaining({
        workflowId: "issue-discovery:org-1:proj-1:score-1",
        workflowIdConflictPolicy: "FAIL",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
      }),
    )
  })

  it("passes closed-id reuse policy when signalWithStart starts or signals an execution", async () => {
    const signalWithStart = vi.fn(async () => ({ signaledRunId: "run-abc" }))
    const client = {
      workflow: {
        signalWithStart,
      },
    } as unknown as Client

    const starter = createWorkflowStarter(client, {
      address: "127.0.0.1:7233",
      namespace: "default",
      taskQueue: "workflows",
    })

    await expect(
      Effect.runPromise(
        starter.signalWithStart(
          "analyzeSessionWorkflow",
          {
            organizationId: "org-1",
            projectId: "proj-1",
            sessionId: "session-1",
            triggeringTraceId: "trace-1",
            triggeringStartTime: "2026-06-08T00:00:00.000Z",
            reason: "trace_completed",
            debounceMs: 1000,
          },
          {
            workflowId: "org:org-1:conversation-intelligence:analyzeSession:proj-1:session-1",
            signal: "traceCompleted",
          },
        ),
      ),
    ).resolves.toBeUndefined()
    expect(signalWithStart).toHaveBeenCalledTimes(1)
    expect(signalWithStart).toHaveBeenCalledWith(
      "analyzeSessionWorkflow",
      expect.objectContaining({
        workflowId: "org:org-1:conversation-intelligence:analyzeSession:proj-1:session-1",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
        taskQueue: "workflows",
        signal: "traceCompleted",
      }),
    )
    expect(signalWithStart).toHaveBeenCalledWith(
      "analyzeSessionWorkflow",
      expect.not.objectContaining({ workflowIdConflictPolicy: expect.anything() }),
    )
  })

  it("passes startDelayMs through to Temporal startDelay", async () => {
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
          "signalDiscoveryWorkflow",
          {
            organizationId: "org-1",
            projectId: "proj-1",
            scoreId: "score-1",
          },
          { workflowId: "issue-discovery:org-1:proj-1:score-1", startDelayMs: 12_000 },
        ),
      ),
    ).resolves.toBeUndefined()
    expect(start).toHaveBeenCalledWith(
      "signalDiscoveryWorkflow",
      expect.objectContaining({
        startDelay: 12_000,
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
          "signalDiscoveryWorkflow",
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
      "signalDiscoveryWorkflow",
      expect.objectContaining({
        workflowIdConflictPolicy: "FAIL",
        workflowIdReusePolicy: "ALLOW_DUPLICATE",
      }),
    )
  })
})

describe("createWorkflowTerminator", () => {
  const clientTerminating = (terminate: () => Promise<void>) =>
    ({ workflow: { getHandle: () => ({ terminate }) } }) as unknown as Client

  it("terminates the workflow with the caller's reason", async () => {
    const terminate = vi.fn(async () => {})
    const terminator = createWorkflowTerminator(clientTerminating(terminate))

    await Effect.runPromise(terminator.terminate("garden:org-1:behavior-1", "behavior deleted by user"))

    expect(terminate).toHaveBeenCalledWith("behavior deleted by user")
  })

  it("succeeds when the workflow is gone, so callers can terminate without querying first", async () => {
    const notFound = Object.create(WorkflowNotFoundError.prototype)
    const terminator = createWorkflowTerminator(
      clientTerminating(async () => {
        throw notFound
      }),
    )

    await expect(Effect.runPromise(terminator.terminate("garden:org-1:behavior-1"))).resolves.toBeUndefined()
  })

  it("succeeds when the workflow already closed", async () => {
    // Temporal reports this as a plain error naming the terminal state, not a typed one.
    const terminator = createWorkflowTerminator(
      clientTerminating(async () => {
        throw new Error("workflow execution already completed")
      }),
    )

    await expect(Effect.runPromise(terminator.terminate("garden:org-1:behavior-1"))).resolves.toBeUndefined()
  })

  it("propagates any other failure", async () => {
    const terminator = createWorkflowTerminator(
      clientTerminating(async () => {
        throw new Error("permission denied")
      }),
    )

    await expect(Effect.runPromise(terminator.terminate("garden:org-1:behavior-1"))).rejects.toThrow(
      "permission denied",
    )
  })
})
