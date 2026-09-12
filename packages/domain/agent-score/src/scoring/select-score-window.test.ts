import { describe, expect, it } from "vitest"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "../artifacts/launch-agent-score-artifact.ts"
import { type ScoreWindowStepCount, selectScoreWindow } from "./select-score-window.ts"

const settings = LAUNCH_AGENT_SCORE_ARTIFACT.window

const counts = (bySize: Readonly<Record<number, number>>): ScoreWindowStepCount[] =>
  settings.stepDays.map((stepDays) => ({ stepDays, eligibleSessions: bySize[stepDays] ?? 0 }))

const select = (bySize: Readonly<Record<number, number>>, previousStepDays?: number) =>
  selectScoreWindow({
    counts: counts(bySize),
    settings,
    ...(previousStepDays !== undefined ? { previousStepDays } : {}),
  })

describe("selectScoreWindow", () => {
  it("takes the shortest step that reaches the target", () => {
    expect(select({ 7: 1_200, 14: 2_400, 21: 3_600, 28: 4_800 })).toMatchObject({
      status: "selected",
      stepDays: 7,
      eligibleSessionCount: 1_200,
      reason: "reachedTarget",
    })
  })

  it("lengthens until a step reaches the target", () => {
    expect(select({ 7: 300, 14: 600, 21: 900, 28: 1_200 })).toMatchObject({ stepDays: 28, reason: "reachedTarget" })
    expect(select({ 7: 400, 14: 800, 21: 1_100, 28: 1_500 })).toMatchObject({ stepDays: 21, reason: "reachedTarget" })
  })

  it("settles on the longest step for a project above the floor that never reaches the target", () => {
    expect(select({ 7: 80, 14: 160, 21: 240, 28: 320 })).toMatchObject({
      status: "selected",
      stepDays: 28,
      eligibleSessionCount: 320,
      reason: "belowTargetAtLongestStep",
    })
  })

  it("withholds below the floor and says what it saw", () => {
    expect(select({ 7: 20, 14: 40, 21: 60, 28: 80 })).toEqual({
      status: "withheld",
      eligibleSessionCount: 80,
      sessionFloor: settings.sessionFloor,
    })
  })

  it("withholds when there is nothing to count at all", () => {
    expect(selectScoreWindow({ counts: [], settings })).toMatchObject({ status: "withheld" })
  })
})

describe("window hysteresis", () => {
  it("keeps the longer step until the shorter one clears the target by the margin", () => {
    // 1,050 reaches the target but not target + 10%, so a project that was on 14 days stays there.
    expect(select({ 7: 1_050, 14: 2_100, 21: 3_150, 28: 4_200 }, 14)).toMatchObject({
      stepDays: 14,
      reason: "heldByHysteresis",
    })
  })

  it("shortens once the shorter step clears the margin", () => {
    expect(select({ 7: 1_150, 14: 2_300, 21: 3_450, 28: 4_600 }, 14)).toMatchObject({
      stepDays: 7,
      reason: "reachedTarget",
    })
  })

  it("keeps the shorter step until it falls the margin below the target", () => {
    // 950 is under the target but not under target - 10%, so 7 days holds rather than lengthening.
    expect(select({ 7: 950, 14: 1_900, 21: 2_850, 28: 3_800 }, 7)).toMatchObject({
      stepDays: 7,
      reason: "heldByHysteresis",
    })
  })

  it("lengthens once the current step falls the margin below the target", () => {
    expect(select({ 7: 850, 14: 1_700, 21: 2_550, 28: 3_400 }, 7)).toMatchObject({
      stepDays: 14,
      reason: "reachedTarget",
    })
  })

  it("does not stick to a step that has dropped below the floor", () => {
    expect(select({ 7: 100, 14: 900, 21: 1_400, 28: 1_900 }, 7)).toMatchObject({ stepDays: 21 })
  })

  it("chooses freshly with no previous snapshot", () => {
    expect(select({ 7: 1_050, 14: 2_100, 21: 3_150, 28: 4_200 })).toMatchObject({ stepDays: 7 })
  })

  it("chooses freshly when the previous step is not one of the candidates", () => {
    expect(select({ 7: 1_050, 14: 2_100, 21: 3_150, 28: 4_200 }, 10)).toMatchObject({ stepDays: 7 })
  })

  it("never holds a window for a project that has fallen under the floor entirely", () => {
    expect(select({ 7: 10, 14: 20, 21: 30, 28: 40 }, 7)).toMatchObject({ status: "withheld" })
  })

  it("does not oscillate: a project sitting in the margin keeps whichever step it had", () => {
    const inTheBand = { 7: 1_020, 14: 2_040, 21: 3_060, 28: 4_080 }

    expect(select(inTheBand, 7)).toMatchObject({ stepDays: 7 })
    expect(select(inTheBand, 14)).toMatchObject({ stepDays: 14 })
  })
})
