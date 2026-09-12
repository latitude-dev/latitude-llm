import type { SignalWithLifecycle } from "@domain/signals"
import { describe, expect, it } from "vitest"
import type { SessionAssessmentItem } from "../entities/session-assessment.ts"
import { buildSafetyIssues, type SafetyIssueSession } from "./build-safety-issues.ts"
import { readSafetyIssueObservations } from "./read-safety-issue-observations.ts"

const item = (
  overrides: {
    readonly groupKey?: string
    readonly label?: string
    readonly status?: "confirmedHarm" | "exposure" | "successfulDefense"
    readonly extraStatus?: "confirmedHarm" | "exposure"
    readonly signalIds?: readonly string[]
  } = {},
): SessionAssessmentItem => {
  const status = overrides.status ?? "confirmedHarm"
  const statuses = overrides.extraStatus ? [overrides.extraStatus, status] : [status]
  return {
    id: overrides.groupKey ?? `item-${status}`,
    evidenceKey: overrides.groupKey ?? `item-${status}`,
    groupKey: overrides.groupKey ?? `issue:safety:${status}`,
    label: overrides.label ?? "Assistant disclosed personal data",
    source: "flagger",
    polarity: "negative",
    impactLevel: "high",
    signalIds: [...(overrides.signalIds ?? [])],
    scoreIds: ["score-1"],
    occurrenceCount: 1,
    effects: statuses.map((entry) => ({
      scoreDimension: "safety" as const,
      role:
        entry === "confirmedHarm"
          ? ("confirmedHarm" as const)
          : entry === "exposure"
            ? ("exposure" as const)
            : ("successfulDefense" as const),
      direction: entry === "confirmedHarm" ? ("negative" as const) : ("context" as const),
      measurement: "observed" as const,
      benchmarkUse: entry === "confirmedHarm" ? ("direct" as const) : ("contextOnly" as const),
      impact: { kind: "safety" as const, status: entry, findingKind: "injectionCompliance" },
    })),
    anchors: [],
    destinations: [],
  }
}

const nonSafetyItem = (): SessionAssessmentItem => ({
  ...item(),
  groupKey: "issue:tool-repetition",
  effects: [
    {
      scoreDimension: "cost",
      role: "spendEfficiency",
      direction: "negative",
      measurement: "notMeasured",
      benchmarkUse: "modeled",
    },
  ],
})

const signal = (id: string, overrides: Partial<SignalWithLifecycle> = {}): SignalWithLifecycle =>
  ({
    id,
    origin: "system",
    promotedAt: new Date("2026-01-01T00:00:00.000Z"),
    ignoredAt: null,
    deletedAt: null,
    ...overrides,
  }) as SignalWithLifecycle

const session = (
  sessionId: string,
  options: {
    readonly harmed?: boolean
    readonly items: readonly SessionAssessmentItem[]
    readonly signals?: readonly SignalWithLifecycle[]
    readonly probability?: number
  },
): SafetyIssueSession => ({
  sessionId,
  harmed: options.harmed ?? false,
  examinationProbability: options.probability ?? 0.1,
  observations: readSafetyIssueObservations({
    items: options.items,
    signals: options.signals ?? [],
    observationProbability: options.probability ?? 0.1,
  }),
})

describe("readSafetyIssueObservations", () => {
  it("ignores items that carry no Safety effect", () => {
    const observations = readSafetyIssueObservations({ items: [nonSafetyItem()], signals: [] })

    expect(observations.confirmedHarm).toEqual([])
    expect(observations.exposure).toEqual([])
  })

  // The page lists exposure separately from harm, so an attack that succeeded
  // belongs beside the score once rather than in both tables.
  it("puts a harmed session's attack in the harm table only", () => {
    const observations = readSafetyIssueObservations({
      items: [item({ status: "confirmedHarm", extraStatus: "exposure" })],
      signals: [],
    })

    expect(observations.confirmedHarm).toHaveLength(1)
    expect(observations.exposure).toEqual([])
  })

  it("keeps a refused attack in the exposure table", () => {
    const observations = readSafetyIssueObservations({ items: [item({ status: "exposure" })], signals: [] })

    expect(observations.exposure).toHaveLength(1)
    expect(observations.confirmedHarm).toEqual([])
  })

  it.each([
    { label: "ignored", overrides: { ignoredAt: new Date("2026-02-01T00:00:00.000Z") } },
    { label: "unpromoted", overrides: { promotedAt: null } },
    { label: "user-created", overrides: { origin: "user" as const } },
  ])("drops an item whose only signal is $label", ({ overrides }) => {
    const observations = readSafetyIssueObservations({
      items: [item({ signalIds: ["signal-1"] })],
      signals: [signal("signal-1", overrides as Partial<SignalWithLifecycle>)],
    })

    expect(observations.confirmedHarm).toEqual([])
  })

  it("keeps an item whose signal is eligible and names it", () => {
    const observations = readSafetyIssueObservations({
      items: [item({ signalIds: ["signal-1"] })],
      signals: [signal("signal-1")],
    })

    expect(observations.confirmedHarm[0]).toMatchObject({ signalId: "signal-1" })
  })

  // The finding and the harm status come from one suite draw, so multiplying
  // them would square a probability that was only rolled once.
  it("marks every observation as riding the suite's own draw", () => {
    const observations = readSafetyIssueObservations({
      items: [item()],
      signals: [],
      observationProbability: 0.1,
    })

    expect(observations.confirmedHarm[0]).toMatchObject({
      sharesEndpointSelection: true,
      observationProbability: 0.1,
    })
  })
})

describe("buildSafetyIssues", () => {
  it("corrects harmed reach for the probability the suite examined the session", () => {
    const { confirmedHarm } = buildSafetyIssues({
      sessions: [
        session("a", { harmed: true, items: [item()], probability: 0.1 }),
        session("b", { harmed: true, items: [item()], probability: 0.1 }),
      ],
    })

    // Two harmed sessions seen at a tenth stand for twenty, and the joint
    // probability is the one draw rather than its square.
    expect(confirmedHarm[0]).toMatchObject({ examinedAdverseSessions: 2, ranked: true })
    expect(confirmedHarm[0]?.estimatedAdverseReach).toBeCloseTo(20, 10)
    expect(confirmedHarm[0]?.estimatedReach).toBeCloseTo(20, 10)
  })

  it("reports how many of an exposure's sessions the agent was harmed in", () => {
    const attempt = item({ status: "exposure", groupKey: "issue:safety:injectionAttempt", label: "Injection attempts" })
    const { exposure } = buildSafetyIssues({
      sessions: [
        session("a", { harmed: false, items: [attempt] }),
        session("b", { harmed: false, items: [attempt] }),
        session("c", { harmed: true, items: [attempt] }),
      ],
    })

    expect(exposure[0]).toMatchObject({ examinedSessions: 3, examinedAdverseSessions: 1 })
  })

  it("counts a session once per issue however many detectors saw it", () => {
    const { confirmedHarm } = buildSafetyIssues({
      sessions: [session("a", { harmed: true, items: [item(), item()] })],
    })

    expect(confirmedHarm).toHaveLength(1)
    expect(confirmedHarm[0]?.examinedSessions).toBe(1)
  })

  it("ranks by corrected harmed reach rather than raw overlap", () => {
    const rare = item({ groupKey: "issue:safety:rare", label: "Rare disclosure" })
    const common = item({ groupKey: "issue:safety:common", label: "Common disclosure" })
    const { confirmedHarm } = buildSafetyIssues({
      sessions: [
        session("a", { harmed: true, items: [rare], probability: 0.01 }),
        ...Array.from({ length: 5 }, (_, index) =>
          session(`common-${index}`, { harmed: true, items: [common], probability: 1 }),
        ),
      ],
    })

    expect(confirmedHarm[0]?.issueKey).toBe("issue:safety:rare")
    expect(confirmedHarm[0]?.examinedSessions).toBeLessThan(confirmedHarm[1]?.examinedSessions ?? 0)
  })

  it("leaves a row unranked when the probability behind it was never recorded", () => {
    const unknown: SafetyIssueSession = {
      sessionId: "a",
      harmed: true,
      examinationProbability: 0.1,
      observations: readSafetyIssueObservations({ items: [item()], signals: [] }),
    }
    const { confirmedHarm } = buildSafetyIssues({ sessions: [unknown] })

    expect(confirmedHarm[0]).toMatchObject({ ranked: false })
    expect(confirmedHarm[0]?.estimatedAdverseReach).toBeUndefined()
    expect(confirmedHarm[0]?.examinedSessions).toBe(1)
  })
})
