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
    expect(select({ 7: 30, 14: 60, 21: 90, 28: 120 })).toMatchObject({ stepDays: 28, reason: "reachedTarget" })
    expect(select({ 7: 40, 14: 80, 21: 110, 28: 150 })).toMatchObject({ stepDays: 21, reason: "reachedTarget" })
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
    expect(select({ 7: 105, 14: 210, 21: 315, 28: 420 }, 14)).toMatchObject({
      stepDays: 14,
      reason: "heldByHysteresis",
    })
  })

  it("shortens once the shorter step clears the margin", () => {
    expect(select({ 7: 115, 14: 230, 21: 345, 28: 460 }, 14)).toMatchObject({
      stepDays: 7,
      reason: "reachedTarget",
    })
  })

  it("lengthens when the current step falls below the publication floor", () => {
    expect(select({ 7: 95, 14: 190, 21: 285, 28: 380 }, 7)).toMatchObject({
      stepDays: 14,
      reason: "reachedTarget",
    })
  })

  it("lengthens once the current step falls the margin below the target", () => {
    expect(select({ 7: 85, 14: 170, 21: 255, 28: 340 }, 7)).toMatchObject({
      stepDays: 14,
      reason: "reachedTarget",
    })
  })

  it("does not stick to a step that has dropped below the floor", () => {
    expect(select({ 7: 50, 14: 90, 21: 140, 28: 190 }, 7)).toMatchObject({ stepDays: 21 })
  })

  it("chooses freshly with no previous snapshot", () => {
    expect(select({ 7: 105, 14: 210, 21: 315, 28: 420 })).toMatchObject({ stepDays: 7 })
  })

  it("chooses freshly when the previous step is not one of the candidates", () => {
    expect(select({ 7: 105, 14: 210, 21: 315, 28: 420 }, 10)).toMatchObject({ stepDays: 7 })
  })

  it("never holds a window for a project that has fallen under the floor entirely", () => {
    expect(select({ 7: 5, 14: 10, 21: 15, 28: 20 }, 7)).toMatchObject({ status: "withheld" })
  })

  it("does not oscillate: a project sitting in the margin keeps whichever step it had", () => {
    const inTheBand = { 7: 102, 14: 204, 21: 306, 28: 408 }

    expect(select(inTheBand, 7)).toMatchObject({ stepDays: 7 })
    expect(select(inTheBand, 14)).toMatchObject({ stepDays: 14 })
  })
})

describe("launch evidence minimum", () => {
  it("accepts exactly 100 eligible sessions", () => {
    expect(select({ 7: 100 })).toMatchObject({ status: "selected", stepDays: 7, eligibleSessionCount: 100 })
  })

  it("withholds a window with only 99 eligible sessions", () => {
    expect(select({ 7: 99, 14: 99, 21: 99, 28: 99 })).toEqual({
      status: "withheld",
      eligibleSessionCount: 99,
      sessionFloor: 100,
    })
  })
})
