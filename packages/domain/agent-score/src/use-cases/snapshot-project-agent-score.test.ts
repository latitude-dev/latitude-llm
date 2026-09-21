import { describe, expect, it } from "vitest"
import { agentScoreSnapshotWorkflowId } from "./snapshot-project-agent-score.ts"

describe("agentScoreSnapshotWorkflowId", () => {
  const scope = { organizationId: "org-1", projectId: "project-1", date: "2026-09-18" }

  it("keeps scheduled snapshots separate from forced refreshes", () => {
    expect(agentScoreSnapshotWorkflowId(scope)).toBe("agent-score:org-1:project-1:2026-09-18:scheduled")
    expect(agentScoreSnapshotWorkflowId({ ...scope, force: true })).toBe(
      "agent-score:org-1:project-1:2026-09-18:force:date-cutoff",
    )
  })

  it("includes an explicit cutoff in forced workflow ids", () => {
    expect(
      agentScoreSnapshotWorkflowId({
        ...scope,
        force: true,
        to: "2026-09-19T00:00:00.000Z",
      }),
    ).toBe("agent-score:org-1:project-1:2026-09-18:force:2026-09-19T00:00:00.000Z")
  })
})
