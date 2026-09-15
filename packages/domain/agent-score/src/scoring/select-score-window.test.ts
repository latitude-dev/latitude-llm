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
    expect(select({ 7: 240, 14: 480, 21: 720, 28: 960 })).toMatchObject({
      status: "selected",
      stepDays: 7,
      eligibleSessionCount: 240,
      reason: "reachedTarget",
    })
  })

  it("lengthens until a step reaches the target", () => {
    expect(select({ 7: 60, 14: 120, 21: 180, 28: 240 })).toMatchObject({ stepDays: 28, reason: "reachedTarget" })
    expect(select({ 7: 80, 14: 160, 21: 220, 28: 300 })).toMatchObject({ stepDays: 21, reason: "reachedTarget" })
  })

  it("settles on the longest step above a lower floor when no step reaches the target", () => {
    expect(
      selectScoreWindow({
        counts: counts({ 7: 60, 14: 120, 21: 180, 28: 240 }),
        settings: { ...settings, sessionTarget: 300 },
      }),
    ).toMatchObject({
      status: "selected",
      stepDays: 28,
      eligibleSessionCount: 240,
      reason: "belowTargetAtLongestStep",
    })
  })

  it("withholds below the floor and says what it saw", () => {
    expect(select({ 7: 40, 14: 80, 21: 120, 28: 160 })).toEqual({
      status: "withheld",
      eligibleSessionCount: 160,
      sessionFloor: settings.sessionFloor,
    })
  })

  it("withholds when there is nothing to count at all", () => {
    expect(selectScoreWindow({ counts: [], settings })).toMatchObject({ status: "withheld" })
  })
})

describe("window hysteresis", () => {
  it("keeps the longer step until the shorter one clears the target by the margin", () => {
    expect(select({ 7: 210, 14: 420, 21: 630, 28: 840 }, 14)).toMatchObject({
      stepDays: 14,
      reason: "heldByHysteresis",
    })
  })

  it("shortens once the shorter step clears the margin", () => {
    expect(select({ 7: 230, 14: 460, 21: 690, 28: 920 }, 14)).toMatchObject({
      stepDays: 7,
      reason: "reachedTarget",
    })
  })

  it("lengthens when the current step falls below the publication floor", () => {
    expect(select({ 7: 190, 14: 380, 21: 570, 28: 760 }, 7)).toMatchObject({
      stepDays: 14,
      reason: "reachedTarget",
    })
  })

  it("lengthens once the current step falls the margin below the target", () => {
    expect(select({ 7: 170, 14: 340, 21: 510, 28: 680 }, 7)).toMatchObject({
      stepDays: 14,
      reason: "reachedTarget",
    })
  })

  it("does not stick to a step that has dropped below the floor", () => {
    expect(select({ 7: 100, 14: 180, 21: 280, 28: 380 }, 7)).toMatchObject({ stepDays: 21 })
  })

  it("chooses freshly with no previous snapshot", () => {
    expect(select({ 7: 210, 14: 420, 21: 630, 28: 840 })).toMatchObject({ stepDays: 7 })
  })

  it("chooses freshly when the previous step is not one of the candidates", () => {
    expect(select({ 7: 210, 14: 420, 21: 630, 28: 840 }, 10)).toMatchObject({ stepDays: 7 })
  })

  it("never holds a window for a project that has fallen under the floor entirely", () => {
    expect(select({ 7: 10, 14: 20, 21: 30, 28: 40 }, 7)).toMatchObject({ status: "withheld" })
  })

  it("does not oscillate: a project sitting in the margin keeps whichever step it had", () => {
    const inTheBand = { 7: 204, 14: 408, 21: 612, 28: 816 }

    expect(select(inTheBand, 7)).toMatchObject({ stepDays: 7 })
    expect(select(inTheBand, 14)).toMatchObject({ stepDays: 14 })
  })
})
