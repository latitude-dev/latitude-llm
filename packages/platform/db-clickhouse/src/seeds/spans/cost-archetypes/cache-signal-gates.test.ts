import type { ProjectId } from "@domain/shared/seeding"
import { SEED_COST_ARCHETYPE_PROJECTS, SEED_PROJECT_ID } from "@domain/shared/seeding"
import type { CacheFindingSuppression } from "@domain/spans"
import {
  CACHE_SIGNAL_MIN_CALLS,
  CACHE_SIGNAL_STABILITY_WINDOWS,
  cacheFindingFingerprint,
  cacheFindingWindows,
  evaluateCacheFinding,
} from "@domain/spans"
import { describe, expect, it } from "vitest"
import { feedCacheFindingReview, feedJudgedWindows } from "./cache-feeder.ts"
import {
  CACHE_SIGNAL_NEGATIVE_COHORTS,
  CACHE_SIGNAL_OSCILLATING_COHORTS,
  CACHE_SIGNAL_POSITIVE_COHORTS,
} from "./cache-signal-qa.ts"
import type { CostCohort } from "./cohorts.ts"
import { HEALTHY_COHORTS } from "./healthy.ts"

/**
 * The QA plan for LAT-822, executable. `dev-docs/cost-cache-signals.md` explains what each
 * case is for; this file is what proves it, on the same fixtures the seeded archetypes use.
 */

const ANCHOR = new Date("2026-08-05T00:00:00.000Z")

const reviewOf = (cohorts: readonly CostCohort[], projectId: ProjectId = SEED_PROJECT_ID) =>
  feedCacheFindingReview({ cohorts, projectId, anchor: ANCHOR })

const suppressionOf = (
  cohorts: readonly CostCohort[],
  model: string,
  projectId: ProjectId = SEED_PROJECT_ID,
): CacheFindingSuppression | "fired" => {
  const review = reviewOf(cohorts, projectId)
  if (review.findings.some((finding) => finding.measures.model === model)) return "fired"
  const suppressed = review.suppressed.find((entry) => entry.model === model)
  if (!suppressed) throw new Error(`${model} produced neither a finding nor a suppression`)
  return suppressed.suppressedBy
}

describe("cache signals — must fire", () => {
  const review = reviewOf(CACHE_SIGNAL_POSITIVE_COHORTS)
  const byModel = (model: string) => review.findings.find((finding) => finding.measures.model === model)

  it.each([
    ["gpt-5-mini", "cacheIt"],
    ["claude-opus-4-7", "stopCaching"],
    ["claude-haiku-4-5", "investigate"],
  ] as const)("fires %s as %s and carries the dispatch payload", (model, state) => {
    const finding = byModel(model)
    expect(finding?.measures.state, model).toBe(state)
    expect(finding?.fingerprint).toBe(
      cacheFindingFingerprint({ provider: finding?.measures.provider ?? "", model, state }),
    )
    // Every field the dispatched agent is briefed on has to be a real number, not a null
    // the prompt renders as "undefined".
    expect(finding?.measures.modeledSavingsMicrocents).toBeGreaterThan(0)
    expect(finding?.measures.ceilingRate).toBeGreaterThanOrEqual(0)
    expect(finding?.measures.calls).toBeGreaterThanOrEqual(CACHE_SIGNAL_MIN_CALLS)
    expect(finding?.measures.cacheLifetimeSeconds).toBeGreaterThan(0)
  })
})

describe("cache signals — must not fire", () => {
  it("stays silent on the healthy archetype, which is what it exists to prove", () => {
    // If a well-run project produces one finding, the gates are wrong. Asserted on the
    // seeded archetype rather than a copy of it, so the fixture cannot drift from the one
    // the dashboard is judged against.
    const review = reviewOf(HEALTHY_COHORTS, SEED_COST_ARCHETYPE_PROJECTS.healthy.id)
    expect(review.findings).toEqual([])
  })

  it("keeps the healthy archetype's `gpt-5.4` row quiet on the sample floor, not the verdict", () => {
    // Pinned because it is the uncomfortable one. Archetype A's daily bursts are all warm
    // against `gpt-5.4`'s documented one-day lifetime, so its ceiling is ~99% and its 83%
    // rate really does leave money — the panel says `investigate` and is right. What keeps
    // it out of the inbox is the 100-call weekly floor, which its ten-calls-a-day cadence
    // does not clear. Raising that cohort's volume would turn the calm archetype into a
    // firing one, and this assertion is what would say so.
    const review = reviewOf(HEALTHY_COHORTS, SEED_COST_ARCHETYPE_PROJECTS.healthy.id)
    expect(review.suppressed.find((entry) => entry.model === "gpt-5.4")).toEqual({
      provider: "openai",
      model: "gpt-5.4",
      state: "investigate",
      suppressedBy: "sampleFloor",
    })
  })

  it.each([
    ["signal-sparse-low-rate", "claude-opus-4-5", "sampleFloor"],
    ["signal-at-ceiling", "claude-opus-4-5", "notActionable"],
    ["signal-free", "google/gemma-4-31b-it:free", "notActionable"],
    ["signal-below-spend-floor", "gpt-5-nano", "spendFloor"],
    ["signal-below-sample-floor", "gpt-5.4-mini", "sampleFloor"],
  ] as const)("suppresses %s by the %s gate", (key, model, gate) => {
    // One cohort at a time: the negatives share models on purpose (sparse and at-ceiling are
    // both `claude-opus-4-5`, because the same model behaving two ways is the realistic
    // case), and a combined project would blend them into one row.
    const cohorts = CACHE_SIGNAL_NEGATIVE_COHORTS.filter((cohort) => cohort.key === key)
    expect(cohorts).toHaveLength(1)
    expect(suppressionOf(cohorts, model)).toBe(gate)
  })

  it("does not churn on a series oscillating around the threshold", () => {
    // Each week's verdict is defensible on its own; the alternation is what must never
    // reach an inbox.
    const review = reviewOf(CACHE_SIGNAL_OSCILLATING_COHORTS)
    expect(review.findings).toEqual([])
    expect(review.suppressed.map((entry) => entry.suppressedBy)).toContain("unstable")
  })

  it("needs the alternating series to actually alternate, or the case proves nothing", () => {
    // A fixture that is uniformly suppressed would pass the test above for the wrong
    // reason, so assert the middle window really does disagree with the outer two.
    const windows = feedJudgedWindows({
      cohorts: CACHE_SIGNAL_OSCILLATING_COHORTS,
      projectId: SEED_PROJECT_ID,
      anchor: ANCHOR,
    })
    const fires = windows.map((rows) =>
      rows.some((row) => row.model === "claude-haiku-4-5" && evaluateCacheFinding(row).fires),
    )
    expect(fires.slice(0, CACHE_SIGNAL_STABILITY_WINDOWS)).toEqual([true, false, true])
  })

  it("stays silent on a project younger than the stability requirement", () => {
    // Only the most recent window carries traffic, so there is nothing to have held.
    const recentOnly = CACHE_SIGNAL_POSITIVE_COHORTS.map((cohort) => ({
      ...cohort,
      cadence: { ...cohort.cadence, clusters: 60, clusterSpacingHours: 2 },
    }))
    expect(reviewOf(recentOnly).findings).toEqual([])
  })
})

describe("cache signals — the producer reads what the panel renders", () => {
  /**
   * Half the drift check for the one-classifier rule, on the producer's side: every number
   * a signal carries is read straight off the `documented` judgment the cost panel renders
   * for the same window, never recomputed. The panel's own half lives beside the panel, in
   * `apps/web`'s `cache-economics-view.test.ts`, where the actionable-state list it groups
   * by is pinned to `CACHE_SIGNAL_STATES`.
   */
  const cohorts = [...CACHE_SIGNAL_POSITIVE_COHORTS, ...CACHE_SIGNAL_NEGATIVE_COHORTS]
  const windows = feedJudgedWindows({ cohorts, projectId: SEED_PROJECT_ID, anchor: ANCHOR })
  const current = windows[0] ?? []

  it("judges the window ending at the anchor, which is what the panel would show", () => {
    const [newest] = cacheFindingWindows(ANCHOR)
    expect(newest?.to.getTime()).toBe(ANCHOR.getTime())
  })

  it("carries the documented judgment's numbers unchanged", () => {
    const review = reviewOf(cohorts)
    expect(review.findings.length).toBeGreaterThan(0)

    for (const finding of review.findings) {
      const row = current.find(
        (entry) => entry.provider === finding.measures.provider && entry.model === finding.measures.model,
      )
      expect(row, `${finding.measures.provider} ${finding.measures.model}`).toBeDefined()
      expect(row?.documented.state).toBe(finding.measures.state)
      expect(row?.documented.urgency).toBe(finding.measures.urgency)
      expect(row?.documented.actualRate).toBe(finding.measures.actualRate)
      expect(row?.documented.ceilingRate).toBe(finding.measures.ceilingRate)
      expect(row?.documented.breakEvenRate).toBe(finding.measures.breakEvenRate)
      expect(row?.documented.modeledSavingsMicrocents).toBe(finding.measures.modeledSavingsMicrocents)
      expect(row?.documentedLifetimeSeconds).toBe(finding.measures.cacheLifetimeSeconds)
      expect(row?.costMicrocents).toBe(finding.measures.spendMicrocents)
      expect(row?.calls).toBe(finding.measures.calls)
    }
  })

  it("never fires on a verdict the panel took from an explored lifetime", () => {
    // A lifetime the reader picked is their assumption. Every fired finding has to be
    // reachable from the documented reading alone.
    for (const finding of reviewOf(cohorts).findings) {
      const row = current.find(
        (entry) => entry.provider === finding.measures.provider && entry.model === finding.measures.model,
      )
      expect(row?.verdictDependsOnLifetime).toBe(false)
      expect(row?.documentedLifetimeSeconds).not.toBeNull()
    }
  })
})
