import { describe, expect, it } from "vitest"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import { EMPTY_WINDOW_SIGNAL_EFFECTS, type SessionSignalEvidence } from "./build-window-signal-effects.ts"
import { EMPTY_WINDOW_FOLD } from "./fold-window-contributions.ts"
import { observeDimensionCauses } from "./observe-dimension-causes.ts"

const signalEvidence: SessionSignalEvidence = {
  sessionId: "session-1",
  stratum: "test",
  fold: 0,
  familyPenaltyShare: { spend: 0, context: 0, tools: 0, memory: 0, recovery: 0 },
  avoidableNs: 0,
  unlinkedSignalIds: ["signal-1"],
  inclusionProbabilityBySignalId: new Map([["signal-1", 1]]),
  linkedSignalIds: [],
  signals: [{ signalId: "signal-1", label: "Repeated answers", scoreDimensions: ["cost"] }],
}

describe("observeDimensionCauses", () => {
  it("keeps measured causes and unmeasured signals without calculating score impact", () => {
    const causes = observeDimensionCauses({
      fold: {
        ...EMPTY_WINDOW_FOLD,
        foldedSessionCount: 3,
        costCauseUnits: new Map([["tools.repeated_call", { family: "tools", penalizedUnits: 2 }]]),
        speedCauseNs: new Map([["latency:ttft", 500_000]]),
      },
      reliabilityEndpoints: [
        { sessionId: "session-1", terminalFailure: true, readable: true, causes: ["toolFailure"] },
      ],
      signalEvidence: [signalEvidence],
      signalEffects: EMPTY_WINDOW_SIGNAL_EFFECTS,
      catalog: PROVISIONAL_COST_METRIC_CATALOG,
    })

    expect(causes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scoreDimension: "reliability", causeId: "toolFailure", measurement: "measured" }),
        expect.objectContaining({ scoreDimension: "cost", causeId: "tools.repeated_call", measurement: "measured" }),
        expect.objectContaining({ scoreDimension: "speed", causeId: "latency:ttft", measurement: "measured" }),
        expect.objectContaining({
          scoreDimension: "cost",
          causeId: "signal:signal-1",
          measurement: "notMeasured",
        }),
      ]),
    )
  })
})
