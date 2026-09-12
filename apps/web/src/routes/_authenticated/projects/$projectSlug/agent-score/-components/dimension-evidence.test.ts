import { describe, expect, it } from "vitest"
import { buildDimensionEvidence } from "./dimension-evidence.ts"

type Explanation = Parameters<typeof buildDimensionEvidence>[0]["explanation"]

const explanation = {
  eligibleSessionCount: 100,
  attribution: [],
  issues: { outcome: [], safety: { confirmedHarm: [], exposure: [] } },
  native: {
    observedCriticalPathNs: 100,
    avoidableCriticalPathNs: 20,
    costFamilyPenalties: { tokens: 0.25 },
  },
  coverage: {
    outcomeExaminedSessions: 0,
    safetyExaminedSessions: 20,
    reliabilityReadableSessions: 100,
    cost: {
      coverage: "unmeasured",
      families: [
        {
          family: "tokens",
          required: true,
          applicableReadings: 100,
          readableReadings: 40,
          coverage: 0.4,
          meetsCoverageFloor: false,
        },
      ],
      publishableSessionCount: 40,
      withheldSessionCount: 60,
      publishableSessionShare: 0.4,
    },
    speed: {
      coverage: "measured",
      completeSessionCount: 100,
      incompleteSessionCount: 0,
      completeShareOfEligible: 1,
    },
    readers: [],
  },
} as unknown as Explanation

describe("buildDimensionEvidence", () => {
  it("keeps missing coverage separate from causes", () => {
    const evidence = buildDimensionEvidence({ dimension: "outcome", snapshot: null, explanation })

    expect(evidence.affected).toEqual([])
    expect(evidence.coverageGaps).toEqual([
      expect.objectContaining({ label: "Outcome verdict coverage", value: "0%", progress: 1 }),
    ])
  })

  it("shows cost penalties as effects and unreadable cost as coverage", () => {
    const evidence = buildDimensionEvidence({ dimension: "cost", snapshot: null, explanation })

    expect(evidence.affected).toEqual([expect.objectContaining({ label: "Tokens inefficiency", value: "25.0%" })])
    expect(evidence.coverageGaps.map((row) => row.label)).toEqual(["Publishable cost sessions", "Tokens coverage"])
  })

  it("does not describe safety exposure as confirmed harm", () => {
    const withExposure = {
      ...explanation,
      issues: {
        ...explanation.issues,
        safety: {
          confirmedHarm: [],
          exposure: [
            {
              issueKey: "prompt-injection",
              label: "Prompt injection exposure",
              signalIds: ["signal-1"],
              estimatedReach: 10,
              estimatedAdverseReach: 1,
              examinedSessions: 2,
              examinedAdverseSessions: 0,
              ranked: true,
            },
          ],
        },
      },
    } as unknown as Explanation

    const evidence = buildDimensionEvidence({ dimension: "safety", snapshot: null, explanation: withExposure })

    expect(evidence.affected).toEqual([])
    expect(evidence.context).toEqual([
      expect.objectContaining({ label: "Prompt injection exposure", value: "10 sessions" }),
    ])
  })
})
