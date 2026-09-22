import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { evaluateMomentDegradation } from "./evaluate-moment-degradation.ts"

const RULES = LAUNCH_AGENT_SCORE_ARTIFACT.outcomeDegradation.rules

const moment = (kinds: readonly { kind: string; confidence: number }[], index = 0): AssessmentFinding => ({
  evidenceKey: `moment:${index}`,
  label: "Conversation moment",
  source: "moment",
  metricId: "moments.conversation",
  signalIds: [],
  scoreIds: [],
  occurrenceCount: 1,
  chronology: {},
  anchors: [],
  destinations: [],
  independentHumanEvidence: false,
  kind: "moment",
  momentKinds: [...new Set(kinds.map((entry) => entry.kind))],
  momentLabels: kinds,
})

const session = (
  findings: readonly AssessmentFinding[],
  momentsAnalyzed = true,
): Pick<NormalizedSessionAssessmentInput, "findings" | "momentsAnalyzed"> => ({ findings, momentsAnalyzed })

describe("evaluateMomentDegradation", () => {
  it("degrades on a single high-confidence frustration", () => {
    const result = evaluateMomentDegradation({
      session: session([moment([{ kind: "user_frustration", confidence: 0.9 }])]),
      rules: RULES,
    })

    expect(result).toEqual({ degraded: true, kinds: ["user_frustration"] })
  })

  it("leaves an ordinary conversation alone until corrections repeat", () => {
    const once = [moment([{ kind: "user_correction", confidence: 0.9 }])]
    const thrice = [0, 1, 2].map((index) => moment([{ kind: "user_correction", confidence: 0.9 }], index))

    expect(evaluateMomentDegradation({ session: session(once), rules: RULES }).degraded).toBe(false)
    expect(evaluateMomentDegradation({ session: session(thrice), rules: RULES })).toEqual({
      degraded: true,
      kinds: ["user_correction"],
    })
  })

  it("ignores a label below its scoring confidence floor", () => {
    // Stored at 0.8, which the classifier accepts; scoring asks for 0.85 before it moves a number.
    const result = evaluateMomentDegradation({
      session: session([moment([{ kind: "user_frustration", confidence: 0.82 }])]),
      rules: RULES,
    })

    expect(result.degraded).toBe(false)
  })

  it.each([
    "policy_refusal",
    "hesitation",
    "stalling",
    "resolution",
    "user_satisfaction",
  ])("never degrades on %s", (kind) => {
    const findings = [0, 1, 2, 3].map((index) => moment([{ kind, confidence: 1 }], index))

    expect(evaluateMomentDegradation({ session: session(findings), rules: RULES }).degraded).toBe(false)
  })

  it("reports every kind that met its rule, so a cause row can name them", () => {
    const result = evaluateMomentDegradation({
      session: session([
        moment([
          { kind: "user_frustration", confidence: 0.9 },
          { kind: "abandonment", confidence: 0.9 },
        ]),
      ]),
      rules: RULES,
    })

    expect(result.kinds).toEqual(["abandonment", "user_frustration"])
  })

  it("finds nothing on a session analysis never read", () => {
    const findings = [moment([{ kind: "user_frustration", confidence: 1 }])]

    expect(evaluateMomentDegradation({ session: session(findings, false), rules: RULES }).degraded).toBe(false)
  })
})
