import type { WorkflowDescription } from "@domain/queue"
import { describe, expect, it } from "vitest"
import { toAgentScoreComputationRecord } from "./agent-score-computation.ts"

const workflow = (runId: string, status: WorkflowDescription["status"], startTime: string): WorkflowDescription => ({
  runId,
  status,
  startTime: new Date(startTime),
  closeTime: status === "running" ? null : new Date("2026-09-21T10:05:00.000Z"),
  failure: null,
})

describe("toAgentScoreComputationRecord", () => {
  it("reports an active forced or scheduled snapshot", () => {
    const result = toAgentScoreComputationRecord({
      date: "2026-09-21",
      descriptions: [
        workflow("scheduled", "completed", "2026-09-21T09:00:00.000Z"),
        workflow("forced", "running", "2026-09-21T10:00:00.000Z"),
      ],
    })

    expect(result).toEqual({
      date: "2026-09-21",
      status: "computing",
      marker: "forced:running:open",
    })
  })

  it("reports idle and changes the marker when the latest run completes", () => {
    const result = toAgentScoreComputationRecord({
      date: "2026-09-21",
      descriptions: [null, workflow("forced", "completed", "2026-09-21T10:00:00.000Z")],
    })

    expect(result).toEqual({
      date: "2026-09-21",
      status: "idle",
      marker: "forced:completed:2026-09-21T10:05:00.000Z",
    })
  })

  it("uses a stable marker when no workflow exists", () => {
    expect(toAgentScoreComputationRecord({ date: "2026-09-21", descriptions: [null, null] })).toEqual({
      date: "2026-09-21",
      status: "idle",
      marker: "none",
    })
  })
})
