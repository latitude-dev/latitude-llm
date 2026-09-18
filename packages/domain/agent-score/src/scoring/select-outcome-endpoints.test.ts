import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type { AssessmentFinding, NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { hasDeterministicOutcomeFailure, selectDeterministicOutcomeFailures } from "./select-outcome-endpoints.ts"

const reference = {
  evidenceKey: "evidence",
  label: "Finding",
  source: "metric" as const,
  signalIds: [],
  scoreIds: [],
  occurrenceCount: 1,
  chronology: {},
  anchors: [],
  destinations: [],
  independentHumanEvidence: false,
}

const noOutput = (findingKind: "blank" | "confirmedUnusablePattern" | "unconfirmedPattern"): AssessmentFinding => ({
  ...reference,
  kind: "noOutput",
  findingKind,
})

const finishFailure = (generationPosition: "final" | "intermediate"): AssessmentFinding => ({
  ...reference,
  kind: "finishFailure",
  findingKind: "contentFilter",
  generationPosition,
  observedMicrocents: 0,
  observedNs: 0,
})

const session = (
  findings: readonly AssessmentFinding[],
  hasReadableUserTask = true,
): NormalizedSessionAssessmentInput =>
  ({
    sessionId: SessionId("session-1"),
    hasReadableUserTask,
    observedMicrocents: 0,
    observedDurationNs: 0,
    findings,
    readers: [],
    screeningDecisions: [],
    scoringEligibleSignalIds: [],
  }) satisfies NormalizedSessionAssessmentInput

describe("hasDeterministicOutcomeFailure", () => {
  it.each(["blank", "confirmedUnusablePattern"] as const)("treats %s output as a certain failure", (findingKind) => {
    expect(hasDeterministicOutcomeFailure(session([noOutput(findingKind)]))).toBe(true)
  })

  // A compact answer like `111` can be exactly what was asked for.
  it("does not convict an unconfirmed repeated-character pattern", () => {
    expect(hasDeterministicOutcomeFailure(session([noOutput("unconfirmedPattern")]))).toBe(false)
  })

  it("counts an unreliable finish only on the final generation", () => {
    expect(hasDeterministicOutcomeFailure(session([finishFailure("final")]))).toBe(true)
    expect(hasDeterministicOutcomeFailure(session([finishFailure("intermediate")]))).toBe(false)
  })

  // A session with no user-authored request has nothing to have failed.
  it("is not applicable when no user task is readable", () => {
    expect(hasDeterministicOutcomeFailure(session([noOutput("blank")], false))).toBe(false)
    expect(hasDeterministicOutcomeFailure(session([finishFailure("final")], false))).toBe(false)
  })

  it("leaves a session with no endpoint to the judge", () => {
    expect(hasDeterministicOutcomeFailure(session([]))).toBe(false)
  })
})

describe("selectDeterministicOutcomeFailures", () => {
  it("returns only the session ids that failed with certainty", () => {
    const failing = { ...session([noOutput("blank")]), sessionId: SessionId("failed") }
    const judgeable = { ...session([]), sessionId: SessionId("judgeable") }
    const notApplicable = { ...session([noOutput("blank")], false), sessionId: SessionId("no-task") }

    expect(selectDeterministicOutcomeFailures([failing, judgeable, notApplicable])).toEqual(["failed"])
  })
})
