import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import type {
  AssessmentFinding,
  AssessmentReaderFact,
  NormalizedSessionAssessmentInput,
} from "../entities/session-assessment-input.ts"
import { buildSessionDimensionSummaries } from "../resolver/build-dimension-summaries.ts"
import { resolveSessionAssessmentItems } from "../resolver/resolve-assessment-findings.ts"
import { attributeReliabilityWindow } from "./attribute-dimensions.ts"
import { estimateProjectReliability } from "./estimate-reliability.ts"
import { survivalOverReferenceRun } from "./reference-run.ts"
import { selectReliabilityEndpoints } from "./select-reliability-endpoints.ts"

/**
 * One window, followed from the session a person opens to the number a project is shown.
 *
 * Four surfaces describe the same events by different routes: the Scores panel resolves findings
 * into items, the estimator selects endpoints from the same findings, attribution ranks the causes
 * behind the rate, and the composite carries the result. They agree here or they disagree in
 * production, where the symptom is a session that reads as broken beside a dimension that reads as
 * healthy and no way to tell which one lied.
 */

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

const providerError = (terminal: boolean): AssessmentFinding =>
  ({
    ...reference,
    evidenceKey: "provider-error",
    label: "Provider error",
    kind: "providerError",
    findingKind: "serviceFailure",
    recovered: !terminal,
    sameSubjectRecovered: !terminal,
    terminal,
    observedMicrocents: 120,
    observedNs: 400_000_000,
  }) as AssessmentFinding

const toolFailure = (terminal: boolean): AssessmentFinding =>
  ({
    ...reference,
    evidenceKey: "tool-failure",
    label: "Tool call failed",
    kind: "toolFailure",
    recovered: !terminal,
    terminal,
  }) as AssessmentFinding

const usableCompletion = (): AssessmentFinding =>
  ({
    ...reference,
    evidenceKey: "completion",
    label: "Usable completion",
    kind: "usableCompletion",
  }) as AssessmentFinding

const reader = (): AssessmentReaderFact => ({
  readerId: "spans.provider_error",
  label: "Provider errors",
  scoreDimensions: ["reliability", "cost", "speed"],
  applicable: true,
  findingCount: 0,
  readableCount: 1,
  totalCount: 1,
})

const session = (id: string, findings: readonly AssessmentFinding[]): NormalizedSessionAssessmentInput =>
  ({
    sessionId: SessionId(id),
    hasReadableUserTask: true,
    observedMicrocents: 0,
    observedDurationNs: 0,
    findings,
    readers: [reader()],
    scoringEligibleSignalIds: [],
    screeningDecisions: [],
  }) as NormalizedSessionAssessmentInput

/** 90 clean, 8 ended by a provider error, 2 ended by both a provider error and a failed tool call. */
const windowSessions: NormalizedSessionAssessmentInput[] = [
  ...Array.from({ length: 90 }, (_, index) => session(`ok-${index}`, [usableCompletion()])),
  ...Array.from({ length: 8 }, (_, index) => session(`provider-${index}`, [providerError(true)])),
  ...Array.from({ length: 2 }, (_, index) => session(`both-${index}`, [providerError(true), toolFailure(true)])),
]

const completionOf = (input: NormalizedSessionAssessmentInput) =>
  buildSessionDimensionSummaries({ items: resolveSessionAssessmentItems(input.findings) }).find(
    (summary) => summary.scoreDimension === "reliability",
  )?.completion

describe("one window, four surfaces", () => {
  const endpoints = selectReliabilityEndpoints(windowSessions)
  const estimate = estimateProjectReliability({
    eligibleSessionCount: windowSessions.length,
    sessions: endpoints,
    floors: { readableSessions: 1, readableShareOfEligible: 0 },
    referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
  })

  it("calls the same sessions broken on the panel and in the estimator", () => {
    const panelBroken = windowSessions
      .filter((input) => completionOf(input) === "terminalFailure")
      .map((input) => input.sessionId as string)
    const estimatorBroken = endpoints
      .filter((endpoint) => endpoint.terminalFailure)
      .map((endpoint) => endpoint.sessionId)

    expect(estimatorBroken.sort()).toEqual(panelBroken.sort())
    expect(panelBroken).toHaveLength(10)
  })

  it("counts each broken session once, however many findings ended it", () => {
    expect(estimate.terminalFailureSessionCount).toBe(10)
    expect(estimate.readableSessionCount).toBe(100)
  })

  it("produces the rate the transform says it should", () => {
    expect(estimate.successRate).toBeCloseTo(0.9, 12)
    expect(estimate.reliability).toBeCloseTo(
      survivalOverReferenceRun({ adverseRate: 0.1, referenceRunSessions: 20 }),
      9,
    )
  })

  it("names in its cause rows the finding kinds the sessions actually carried", () => {
    const attribution = attributeReliabilityWindow({
      endpoints,
      referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
      observedScore: estimate.reliability as number,
    })

    expect(attribution.rows.map((row) => row.causeId).sort()).toEqual(["providerError", "toolFailure"])
  })

  it("reports each cause reaching exactly the sessions it appeared on", () => {
    const attribution = attributeReliabilityWindow({
      endpoints,
      referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
      observedScore: estimate.reliability as number,
    })
    const nativeOf = (causeId: string) => attribution.rows.find((row) => row.causeId === causeId)?.nativeEffect.value

    expect(nativeOf("providerError")).toBe(10)
    expect(nativeOf("toolFailure")).toBe(2)
  })

  it("closes the deficit it attributes against the score it explains", () => {
    const attribution = attributeReliabilityWindow({
      endpoints,
      referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
      observedScore: estimate.reliability as number,
    })
    const attributed = attribution.rows.reduce((total, row) => total + row.attributedDeficit, 0)

    expect(attributed + attribution.residual).toBeCloseTo(attribution.totalDeficit, 6)
    expect(attribution.totalDeficit).toBeCloseTo(100 - (estimate.reliability as number), 9)
  })

  it("gives the redundant cause no fix gain on the sessions it shares", () => {
    const attribution = attributeReliabilityWindow({
      endpoints,
      referenceRunSessions: LAUNCH_AGENT_SCORE_ARTIFACT.referenceRuns.reliability,
      observedScore: estimate.reliability as number,
    })
    const tool = attribution.rows.find((row) => row.causeId === "toolFailure")

    // Both sessions it ended were also ended by a provider error, so removing it recovers nothing.
    expect(tool?.fixGain).toBe(0)
    expect(tool?.attributedDeficit).toBeGreaterThan(0)
  })

  it("leaves a recovered incident out of every surface", () => {
    const recovered = [
      ...Array.from({ length: 100 }, (_, index) =>
        session(`retry-${index}`, [providerError(false), usableCompletion()]),
      ),
    ]

    expect(recovered.every((input) => completionOf(input) !== "terminalFailure")).toBe(true)
    expect(selectReliabilityEndpoints(recovered).every((endpoint) => !endpoint.terminalFailure)).toBe(true)
  })
})
