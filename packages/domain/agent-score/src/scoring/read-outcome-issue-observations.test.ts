import type { SignalWithLifecycle } from "@domain/signals"
import { scoringEligibleSignalIds } from "@domain/signals"
import { describe, expect, it } from "vitest"
import type { SessionAssessmentItem, SessionDimensionEffect } from "../entities/session-assessment.ts"
import { readOutcomeIssueObservations } from "./read-outcome-issue-observations.ts"

const outcomeEffect = (direction: SessionDimensionEffect["direction"]): SessionDimensionEffect => ({
  scoreDimension: "outcome",
  role: "taskOutcome",
  direction,
  measurement: "observed",
  benchmarkUse: "direct",
})

const item = (overrides: Partial<SessionAssessmentItem> = {}): SessionAssessmentItem =>
  ({
    id: "item-1",
    evidenceKey: "evidence-1",
    groupKey: "issue:no-output:blank",
    label: "No usable final output",
    source: "metric",
    signalIds: [],
    scoreIds: [],
    occurrenceCount: 1,
    effects: [outcomeEffect("negative")],
    anchors: [],
    destinations: [],
    polarity: "negative",
    impactLevel: "high",
    ...overrides,
  }) as SessionAssessmentItem

const signal = (id: string, overrides: Partial<SignalWithLifecycle> = {}): SignalWithLifecycle =>
  ({
    id,
    name: `Signal ${id}`,
    origin: "system",
    promotedAt: new Date("2026-01-01T00:00:00.000Z"),
    ignoredAt: null,
    deletedAt: null,
    ...overrides,
  }) as SignalWithLifecycle

describe("readOutcomeIssueObservations", () => {
  it("takes the item's group key, which already collapses a signal with its source score", () => {
    const observations = readOutcomeIssueObservations({
      items: [item({ groupKey: "signal:refund-loop", signalIds: ["refund-loop"], label: "Refund-flow loop" })],
      eligibleSignalIds: scoringEligibleSignalIds([signal("refund-loop")]),
    })

    expect(observations).toEqual([
      { issueKey: "signal:refund-loop", label: "Refund-flow loop", signalId: "refund-loop" },
    ])
  })

  // Outcome's endpoint is what the issues explain; listing it as its own issue
  // would say the failures are explained by there being failures.
  it("leaves the verdict itself out of the issue list", () => {
    const observations = readOutcomeIssueObservations({
      items: [item({ metricId: "sessions.task_success", label: "Task failure" })],
      eligibleSignalIds: new Set(),
    })

    expect(observations).toEqual([])
  })

  it("ignores evidence that does not push Outcome down", () => {
    const observations = readOutcomeIssueObservations({
      items: [
        item({ effects: [outcomeEffect("positive")] }),
        item({ effects: [{ ...outcomeEffect("negative"), scoreDimension: "cost", role: "spendEfficiency" }] }),
      ],
      eligibleSignalIds: new Set(),
    })

    expect(observations).toEqual([])
  })

  // Workflow state does not describe behaviour, so triage must not move the
  // score's explanation.
  it.each([
    ["ignored", { ignoredAt: new Date("2026-02-01T00:00:00.000Z") }],
    ["unpromoted", { promotedAt: null }],
    ["user-created", { origin: "user" as const }],
  ])("drops a signal item that is %s", (_label, overrides) => {
    const observations = readOutcomeIssueObservations({
      items: [item({ groupKey: "signal:s1", signalIds: ["s1"] })],
      eligibleSignalIds: scoringEligibleSignalIds([signal("s1", overrides as Partial<SignalWithLifecycle>)]),
    })

    expect(observations).toEqual([])
  })

  it("marks an item discovered from the verdict score as sharing its selection", () => {
    const observations = readOutcomeIssueObservations({
      items: [item({ groupKey: "signal:s1", signalIds: ["s1"], scoreIds: ["verdict-score"] })],
      eligibleSignalIds: scoringEligibleSignalIds([signal("s1")]),
      verdictScoreIds: ["verdict-score"],
      observationProbability: 0.1,
    })

    expect(observations[0]).toMatchObject({ sharesEndpointSelection: true, observationProbability: 0.1 })
  })

  it("leaves the probability absent when the reader's selection is unrecorded", () => {
    const observations = readOutcomeIssueObservations({ items: [item()], eligibleSignalIds: new Set() })

    expect(observations[0]).not.toHaveProperty("observationProbability")
  })
})
