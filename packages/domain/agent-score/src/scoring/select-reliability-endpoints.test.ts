import { SessionId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import type {
  AssessmentFinding,
  AssessmentReaderFact,
  NormalizedSessionAssessmentInput,
} from "../entities/session-assessment-input.ts"
import { buildSessionDimensionSummaries } from "../resolver/build-dimension-summaries.ts"
import { resolveSessionAssessmentItems } from "../resolver/resolve-assessment-findings.ts"
import { selectReliabilityEndpoint, selectReliabilityEndpoints } from "./select-reliability-endpoints.ts"

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

const finding = (overrides: Partial<AssessmentFinding> & Pick<AssessmentFinding, "kind">): AssessmentFinding =>
  ({ ...reference, ...overrides }) as AssessmentFinding

const noOutput = (findingKind: "blank" | "confirmedUnusablePattern" | "unconfirmedPattern") =>
  finding({ kind: "noOutput", findingKind })

const providerError = (options: { recovered: boolean; terminal: boolean }) =>
  finding({
    kind: "providerError",
    findingKind: "rateLimit",
    recovered: options.recovered,
    sameSubjectRecovered: options.recovered,
    terminal: options.terminal,
    observedMicrocents: 10,
    observedNs: 1_000,
  })

const toolFailure = (options: { recovered: boolean; terminal: boolean }) =>
  finding({ kind: "toolFailure", recovered: options.recovered, terminal: options.terminal })

const usableCompletion = () => finding({ kind: "usableCompletion" })

/** A promoted Reliability signal occurrence, as the readers hand one to the resolver. */
const reliabilitySignal = (): AssessmentFinding => ({
  ...reference,
  signalIds: ["signal-1"],
  kind: "classifiedJudgment",
  roles: [{ scoreDimension: "reliability", role: "completionOutcome" }],
  negative: true,
  judgmentKind: "evaluation",
  signalOrigin: "system",
})

const reader = (overrides: Partial<AssessmentReaderFact> = {}): AssessmentReaderFact => ({
  readerId: "sessions.no_output",
  label: "Delivered output",
  scoreDimensions: ["outcome", "reliability"],
  applicable: true,
  findingCount: 0,
  readableCount: 1,
  totalCount: 1,
  ...overrides,
})

const session = (
  findings: readonly AssessmentFinding[],
  readers: readonly AssessmentReaderFact[] = [reader()],
): NormalizedSessionAssessmentInput =>
  ({
    sessionId: SessionId("session-1"),
    hasReadableUserTask: true,
    observedMicrocents: 0,
    observedDurationNs: 0,
    findings,
    readers,
    screeningDecisions: [],
  }) as NormalizedSessionAssessmentInput

describe("selectReliabilityEndpoint", () => {
  it("counts a delivered completion as operationally successful", () => {
    expect(selectReliabilityEndpoint(session([usableCompletion()]))).toMatchObject({
      terminalFailure: false,
      readable: true,
    })
  })

  it("counts confirmed missing output as a terminal failure", () => {
    expect(selectReliabilityEndpoint(session([noOutput("blank")])).terminalFailure).toBe(true)
    expect(selectReliabilityEndpoint(session([noOutput("confirmedUnusablePattern")])).terminalFailure).toBe(true)
  })

  it("leaves an unconfirmed output pattern alone, because a compact answer can be the answer", () => {
    expect(selectReliabilityEndpoint(session([noOutput("unconfirmedPattern")])).terminalFailure).toBe(false)
  })

  it("counts a terminal provider error and a terminal tool failure", () => {
    expect(
      selectReliabilityEndpoint(session([providerError({ recovered: false, terminal: true })])).terminalFailure,
    ).toBe(true)
    expect(
      selectReliabilityEndpoint(session([toolFailure({ recovered: false, terminal: true })])).terminalFailure,
    ).toBe(true)
  })

  it("charges a recovered incident nothing, however many there were", () => {
    const recovered = session([
      providerError({ recovered: true, terminal: false }),
      providerError({ recovered: true, terminal: false }),
      toolFailure({ recovered: true, terminal: false }),
      usableCompletion(),
    ])

    expect(selectReliabilityEndpoint(recovered).terminalFailure).toBe(false)
  })

  it("charges an unrecovered incident nothing while the session still completed", () => {
    const completed = session([providerError({ recovered: false, terminal: false }), usableCompletion()])

    expect(selectReliabilityEndpoint(completed).terminalFailure).toBe(false)
  })

  it("counts a damaged or unreliable final generation and ignores an intermediate one", () => {
    const final = session([finding({ kind: "outputDamage", findingKind: "invalidJson", generationPosition: "final" })])
    const intermediate = session([
      finding({ kind: "outputDamage", findingKind: "invalidJson", generationPosition: "intermediate" }),
    ])

    expect(selectReliabilityEndpoint(final).terminalFailure).toBe(true)
    expect(selectReliabilityEndpoint(intermediate).terminalFailure).toBe(false)
  })

  it("never lets a signal occurrence create a terminal failure", () => {
    const signalOnly = session([reliabilitySignal(), usableCompletion()])

    expect(selectReliabilityEndpoint(signalOnly).terminalFailure).toBe(false)
  })

  it("keeps the union idempotent when a signal lands on a session that already failed", () => {
    const withoutSignal = session([noOutput("blank")])
    const withSignal = session([noOutput("blank"), reliabilitySignal()])

    expect(selectReliabilityEndpoint(withSignal).terminalFailure).toBe(
      selectReliabilityEndpoint(withoutSignal).terminalFailure,
    )
  })
})

describe("reliability readability", () => {
  it("excludes a session whose reliability readers could not finish", () => {
    const partial = session(
      [usableCompletion()],
      [
        reader(),
        reader({
          readerId: "spans.finish_failure",
          scoreDimensions: ["outcome", "reliability", "speed"],
          readableCount: 4,
          totalCount: 5,
          limitation: "unmappedTelemetry",
        }),
      ],
    )

    expect(selectReliabilityEndpoint(partial)).toMatchObject({
      readable: false,
      unreadableReason: "unreadableTelemetry",
    })
  })

  it("ignores readers that inform other dimensions", () => {
    const costOnly = session(
      [usableCompletion()],
      [reader(), reader({ readerId: "cost.cache_gap", scoreDimensions: ["cost"], readableCount: 0, totalCount: 3 })],
    )

    expect(selectReliabilityEndpoint(costOnly).readable).toBe(true)
  })

  it("ignores a reader that found nothing applicable", () => {
    const notApplicable = session(
      [usableCompletion()],
      [reader(), reader({ readerId: "spans.provider_error", applicable: false, readableCount: 0, totalCount: 0 })],
    )

    expect(selectReliabilityEndpoint(notApplicable).readable).toBe(true)
  })

  it("excludes a session no reliability reader could examine", () => {
    const unexamined = session([], [reader({ applicable: false, readableCount: 0, totalCount: 0 })])

    expect(selectReliabilityEndpoint(unexamined)).toMatchObject({
      readable: false,
      unreadableReason: "noApplicableReader",
    })
  })

  it("keeps an observed failure in the denominator however poor the rest of the coverage", () => {
    const brokenAndPartlyRead = session(
      [noOutput("blank")],
      [
        reader({ readableCount: 0, totalCount: 1, limitation: "missingTelemetry" }),
        reader({ readerId: "spans.provider_error", scoreDimensions: ["reliability"], readableCount: 0, totalCount: 2 }),
      ],
    )

    expect(selectReliabilityEndpoint(brokenAndPartlyRead)).toMatchObject({ terminalFailure: true, readable: true })
  })
})

describe("selectReliabilityEndpoints", () => {
  it("returns one endpoint per session, in order", () => {
    const endpoints = selectReliabilityEndpoints([
      { ...session([usableCompletion()]), sessionId: SessionId("a") },
      { ...session([noOutput("blank")]), sessionId: SessionId("b") },
    ])

    expect(endpoints.map((endpoint) => endpoint.sessionId)).toEqual(["a", "b"])
    expect(endpoints.map((endpoint) => endpoint.terminalFailure)).toEqual([false, true])
  })
})

describe("agreement with the session panel", () => {
  // The panel and the estimator have to call the same session broken. They read the same findings
  // by different routes, so this is the test that stops them drifting apart.
  const completionOf = (findings: readonly AssessmentFinding[]) =>
    buildSessionDimensionSummaries({ items: resolveSessionAssessmentItems(findings) }).find(
      (summary) => summary.scoreDimension === "reliability",
    )?.completion

  it.each([
    ["confirmed missing output", [noOutput("blank")]],
    [
      "a damaged final generation",
      [finding({ kind: "outputDamage", findingKind: "invalidJson", generationPosition: "final" })],
    ],
    [
      "a terminal malformed tool interaction",
      [finding({ kind: "toolStructuralDefect", findingKind: "malformed", terminal: true })],
    ],
  ])("agrees that %s is a terminal failure", (_label, findings) => {
    expect(completionOf(findings)).toBe("terminalFailure")
    expect(selectReliabilityEndpoint(session(findings)).terminalFailure).toBe(true)
  })

  it.each([
    ["a delivered completion", [usableCompletion()]],
    ["a recovered provider error", [providerError({ recovered: true, terminal: false }), usableCompletion()]],
  ])("agrees that %s is not a terminal failure", (_label, findings) => {
    expect(completionOf(findings)).not.toBe("terminalFailure")
    expect(selectReliabilityEndpoint(session(findings)).terminalFailure).toBe(false)
  })
})
