import { beforeEach, describe, expect, it, vi } from "vitest"

const { snapshotAgentScoreActivity } = vi.hoisted(() => ({
  snapshotAgentScoreActivity: vi.fn(),
}))

vi.mock("@temporalio/workflow", () => ({
  log: { info: vi.fn() },
  proxyActivities: () => ({ snapshotAgentScoreActivity }),
}))

import { agentScoreSnapshotWorkflow } from "./agent-score-snapshot-workflow.ts"

describe("agentScoreSnapshotWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns the durable activity result", async () => {
    const input = {
      organizationId: "org-1",
      projectId: "project-1",
      date: "2026-09-18",
      force: true,
    }
    snapshotAgentScoreActivity.mockResolvedValue({ status: "withheld", reason: "outcome:examinedFloor" })

    await expect(agentScoreSnapshotWorkflow(input)).resolves.toEqual({
      status: "withheld",
      reason: "outcome:examinedFloor",
    })
    expect(snapshotAgentScoreActivity).toHaveBeenCalledWith(input)
  })
})
