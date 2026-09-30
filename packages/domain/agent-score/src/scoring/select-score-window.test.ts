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
    expect(select({ 7: 120, 14: 240, 21: 360, 28: 480 })).toMatchObject({
      status: "selected",
      stepDays: 7,
      eligibleSessionCount: 120,
      reason: "reachedTarget",
    })
  })

  it("lengthens until a step reaches the target", () => {
    expect(select({ 7: 15, 14: 30, 21: 45, 28: 60 })).toMatchObject({ stepDays: 28, reason: "reachedTarget" })
    expect(select({ 7: 20, 14: 40, 21: 55, 28: 75 })).toMatchObject({ stepDays: 21, reason: "reachedTarget" })
  })

  it("settles on the longest step above a lower floor when no step reaches the target", () => {
    expect(
      selectScoreWindow({
        counts: counts({ 7: 30, 14: 60, 21: 90, 28: 120 }),
        settings: { ...settings, sessionTarget: 150 },
      }),
    ).toMatchObject({
      status: "selected",
      stepDays: 28,
      eligibleSessionCount: 120,
      reason: "belowTargetAtLongestStep",
    })
  })

  it("withholds below the floor and says what it saw", () => {
    expect(select({ 7: 10, 14: 20, 21: 30, 28: 40 })).toEqual({
      status: "withheld",
      eligibleSessionCount: 40,
      sessionFloor: settings.sessionFloor,
    })
  })

  it("withholds when there is nothing to count at all", () => {
    expect(selectScoreWindow({ counts: [], settings })).toMatchObject({ status: "withheld" })
  })
})

describe("window hysteresis", () => {
  it("keeps the longer step until the shorter one clears the target by the margin", () => {
    expect(select({ 7: 52, 14: 105, 21: 157, 28: 210 }, 14)).toMatchObject({
      stepDays: 14,
      reason: "heldByHysteresis",
    })
  })

  it("shortens once the shorter step clears the margin", () => {
    expect(select({ 7: 58, 14: 115, 21: 173, 28: 230 }, 14)).toMatchObject({
      stepDays: 7,
      reason: "reachedTarget",
    })
  })

  it("lengthens when the current step falls below the publication floor", () => {
    expect(select({ 7: 45, 14: 95, 21: 143, 28: 190 }, 7)).toMatchObject({
      stepDays: 14,
      reason: "reachedTarget",
    })
  })

  it("lengthens once the current step falls the margin below the target", () => {
    expect(select({ 7: 42, 14: 85, 21: 128, 28: 170 }, 7)).toMatchObject({
      stepDays: 14,
      reason: "reachedTarget",
    })
  })

  it("does not stick to a step that has dropped below the floor", () => {
    expect(select({ 7: 25, 14: 45, 21: 70, 28: 95 }, 7)).toMatchObject({ stepDays: 21 })
  })

  it("chooses freshly with no previous snapshot", () => {
    expect(select({ 7: 52, 14: 105, 21: 157, 28: 210 })).toMatchObject({ stepDays: 7 })
  })

  it("chooses freshly when the previous step is not one of the candidates", () => {
    expect(select({ 7: 52, 14: 105, 21: 157, 28: 210 }, 10)).toMatchObject({ stepDays: 7 })
  })

  it("never holds a window for a project that has fallen under the floor entirely", () => {
    expect(select({ 7: 5, 14: 10, 21: 15, 28: 20 }, 7)).toMatchObject({ status: "withheld" })
  })

  it("does not oscillate: a project sitting in the margin keeps whichever step it had", () => {
    const inTheBand = { 7: 51, 14: 102, 21: 153, 28: 204 }

    expect(select(inTheBand, 7)).toMatchObject({ stepDays: 7 })
    expect(select(inTheBand, 14)).toMatchObject({ stepDays: 14 })
  })
})

describe("launch evidence minimum", () => {
  it("accepts exactly 50 eligible sessions", () => {
    expect(select({ 7: 50 })).toMatchObject({ status: "selected", stepDays: 7, eligibleSessionCount: 50 })
  })

  it("withholds a window with only 49 eligible sessions", () => {
    expect(select({ 7: 49, 14: 49, 21: 49, 28: 49 })).toEqual({
      status: "withheld",
      eligibleSessionCount: 49,
      sessionFloor: 50,
    })
  })
})
