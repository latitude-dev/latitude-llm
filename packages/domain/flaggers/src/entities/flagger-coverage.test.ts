import { OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { emptyFlaggerCoverageRow, flaggerCoverageReportSchema } from "./flagger-coverage.ts"

describe("flagger coverage", () => {
  it("represents a flagger with no screening telemetry without treating it as healthy", () => {
    expect(emptyFlaggerCoverageRow({ flaggerSlug: "refusal", eligibleSessions: 12 })).toEqual({
      flaggerSlug: "refusal",
      eligibleSessions: 12,
      decidedSessions: 0,
      examinedSessions: 0,
      readableSessions: 0,
      readableShare: 0,
      selectionPaths: {
        deterministic: 0,
        hinted: 0,
        uniformSample: 0,
        ordinarySample: 0,
        skipped: 0,
        rateLimited: 0,
      },
      positiveFindings: 0,
      calibrationReadyFindings: 0,
      unknownSelectionProbability: 0,
      unscreenedSessions: 12,
    })
  })

  it("requires bounded non-negative coverage values", () => {
    const parsed = flaggerCoverageReportSchema.parse({
      organizationId: OrganizationId("o".repeat(24)),
      projectId: ProjectId("p".repeat(24)),
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-07T00:00:00.000Z"),
      recordingSince: new Date("2026-09-01T00:00:00.000Z"),
      eligibleSessions: 4,
      sessionsBeforeRecording: 0,
      rows: [
        {
          ...emptyFlaggerCoverageRow({ flaggerSlug: "empty-response", eligibleSessions: 4 }),
          decidedSessions: 4,
          examinedSessions: 3,
          readableSessions: 2,
          readableShare: 0.5,
          positiveFindings: 2,
          calibrationReadyFindings: 1,
          unknownSelectionProbability: 1,
          unscreenedSessions: 0,
        },
      ],
    })

    expect(parsed.rows[0]?.readableShare).toBe(0.5)
    expect(() =>
      flaggerCoverageReportSchema.parse({ ...parsed, rows: [{ ...parsed.rows[0], readableShare: 1.1 }] }),
    ).toThrow()
  })
})
