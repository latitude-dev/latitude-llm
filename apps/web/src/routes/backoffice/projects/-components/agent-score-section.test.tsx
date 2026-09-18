// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { AdminAgentScoreDto } from "../../../../domains/admin/agent-score.functions.ts"
import { AgentScoreSection } from "./agent-score-section.tsx"

afterEach(cleanup)

const score: AdminAgentScoreDto = {
  customerAccessEnabled: false,
  currentDate: "2026-09-18",
  snapshot: {
    date: "2026-09-17",
    score: 74.4,
    interval: { lower: 70.2, upper: 78.6 },
    dimensions: {
      outcome: { score: 81.1, interval: { lower: 77, upper: 85 } },
      reliability: { score: 68.2, interval: { lower: 62, upper: 74 } },
      cost: { score: 76.3, interval: { lower: 72, upper: 80 } },
      speed: { score: 70.4, interval: { lower: 65, upper: 75 } },
      safety: { score: 79.5, interval: { lower: 75, upper: 84 } },
    },
    scoringVersion: "agent-score-v1",
    windowDays: 14,
    eligibleSessionCount: 1_234,
    policyCap: null,
    createdAt: "2026-09-17T04:05:00.000Z",
  },
  explanation: {
    organizationId: "o".repeat(24),
    projectId: "p".repeat(24),
    date: "2026-09-17",
    scoringVersion: "agent-score-v1",
    computedAt: "2026-09-17T04:06:00.000Z",
    window: {
      stepDays: 14,
      from: "2026-09-04T00:00:00.000Z",
      to: "2026-09-17T23:59:59.999Z",
    },
    eligibleSessionCount: 1_234,
    readSessionCount: 1_102,
    publication: { status: "published", sessionFloor: 200, dimensions: [] },
    attribution: [
      {
        scoreDimension: "cost",
        rows: [
          {
            causeId: "tools.repeated_call",
            label: "Repeated tool calls",
            attributedDeficit: 6.4,
            fixGain: 6.4,
            scoreDimension: "cost",
            evidence: "measured",
            observationCount: 92,
            nativeEffect: { value: 184, unit: "tools" },
          },
        ],
        residual: 2.2,
        totalDeficit: 8.6,
        explainedDeficit: 6.4,
        method: "exact",
      },
    ],
    observedCauses: [],
    issues: {
      outcome: [
        {
          issueKey: "outcome.incomplete_answer",
          label: "Incomplete answer",
          signalIds: [],
          estimatedAdverseReach: 11,
          examinedSessions: 100,
          examinedAdverseSessions: 10,
          ranked: true,
        },
      ],
      safety: { confirmedHarm: [], exposure: [] },
    },
    coverage: {
      cost: {
        coverage: "measured",
        families: [],
        publishableSessionCount: 1_102,
        withheldSessionCount: 0,
        publishableSessionShare: 1,
      },
      speed: {
        coverage: "measured",
        completeSessionCount: 1_102,
        incompleteSessionCount: 0,
        completeShareOfEligible: 1,
      },
      readers: [],
      outcomeExaminedSessions: 1_102,
      safetyExaminedSessions: 1_102,
      reliabilityReadableSessions: 1_102,
      unmeasuredSignalEffects: 0,
      artifactVersions: { cost: "cost-v1", costCatalog: "catalog-v1", latency: "latency-v1" },
    },
    native: {
      observedCriticalPathNs: 1,
      avoidableCriticalPathNs: 0,
      costFamilyPenalties: {},
    },
  } as unknown as NonNullable<AdminAgentScoreDto["explanation"]>,
}

describe("AgentScoreSection", () => {
  it("shows the latest score to staff while customer access is disabled", () => {
    render(<AgentScoreSection agentScore={score} />)

    expect(screen.getByText("Customer access disabled")).toBeDefined()
    expect(screen.getByText("74")).toBeDefined()
    expect(screen.getByText("Latest published score")).toBeDefined()
    expect(screen.getByText("No score was published today.")).toBeDefined()
    expect(screen.getByText("1,234 eligible sessions", { exact: false })).toBeDefined()
    expect(screen.getAllByText("Outcome")).toHaveLength(2)
    expect(screen.getByText("Safety")).toBeDefined()
    expect(screen.getByText("What affected this score")).toBeDefined()
    expect(screen.getByText("Repeated tool calls")).toBeDefined()
    expect(screen.getByText("Incomplete answer")).toBeDefined()
    expect(screen.getByText("Other score impact")).toBeDefined()
    expect(screen.queryByText(/score points/)).toBeNull()
    expect(screen.getByText(/1,102 sessions read/)).toBeDefined()
  })

  it("explains when no score has been published", () => {
    render(<AgentScoreSection agentScore={{ ...score, snapshot: null, explanation: null }} />)

    expect(screen.getByText("No published Agent Score yet.")).toBeDefined()
    expect(screen.getByText(/may not yet meet the session and dimension requirements/)).toBeDefined()
  })

  it("explains when cause evidence is unavailable", () => {
    render(<AgentScoreSection agentScore={{ ...score, explanation: null }} />)

    expect(screen.getByText(/Cause evidence has not been prepared/)).toBeDefined()
  })
})
