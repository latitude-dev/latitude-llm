import { describe, expect, it } from "vitest"
import type { ToolMix } from "../entities/report.ts"
import { assignPersonality } from "./assign-personality.ts"

const baseMix: ToolMix = {
  bash: 0,
  read: 0,
  edit: 0,
  write: 0,
  search: 0,
  research: 0,
  plan: 0,
  other: 0,
}

const argsBase = {
  toolMix: baseMix,
  sessions: 10,
  filesTouched: 0,
  commandsRun: 0,
  commits: 0,
  testsRun: 0,
  linesAdded: 5_000,
  linesWritten: 5_000,
  linesRead: 50_000,
}

const run = (overrides: Partial<typeof argsBase>) => assignPersonality({ ...argsBase, ...overrides })

describe("assignPersonality", () => {
  it("falls back to detective when there's no activity at all", () => {
    const result = run({ toolMix: baseMix, sessions: 0 })
    expect(result.kind).toBe("detective")
    expect(result.score).toBe(0)
    expect(result.evidence[0]).toMatch(/no/i)
  })

  it("returns Strategist when plan excess clears the threshold and call count is enough", () => {
    // 10 plan / 100 total = 10% plan share, baseline 3% → excess 7pp (≥ 5pp).
    const result = run({
      toolMix: { ...baseMix, plan: 10, read: 50, edit: 25, bash: 15 },
    })
    expect(result.kind).toBe("strategist")
    expect(result.score).toBeGreaterThan(0)
    expect(result.evidence[0]).toContain("10%")
  })

  it("does not fire Strategist when plan call count is below the floor", () => {
    // 5% plan share would have ≥ 2pp excess but only 5 calls < 10 floor.
    const result = run({
      toolMix: { ...baseMix, plan: 5, read: 60, edit: 35 },
    })
    expect(result.kind).not.toBe("strategist")
  })

  it("returns Scholar when research excess and call count both clear the bar", () => {
    // 10 research / 100 total = 10% research, baseline 2% → excess 8pp.
    const result = run({
      toolMix: { ...baseMix, research: 10, read: 60, edit: 30 },
    })
    expect(result.kind).toBe("scholar")
    expect(result.evidence[0]).toContain("10%")
    expect(result.evidence[1]).toMatch(/WebFetch|WebSearch/)
  })

  it("Strategist beats Scholar when both rules would fire", () => {
    const result = run({
      toolMix: { ...baseMix, plan: 15, research: 15, read: 50, edit: 20 },
    })
    expect(result.kind).toBe("strategist")
  })

  it("returns Consultant when sessions are plentiful but barely any code was touched", () => {
    const result = run({
      toolMix: { ...baseMix, read: 80, search: 20 },
      sessions: 8,
      filesTouched: 4,
      linesAdded: 0,
      linesWritten: 50, // total = 50 < 200
    })
    expect(result.kind).toBe("consultant")
    expect(result.evidence[0]).toContain("8")
  })

  it("does not fire Consultant when sessions are too few", () => {
    const result = run({
      toolMix: { ...baseMix, read: 80, search: 20 },
      sessions: 3,
      linesAdded: 0,
      linesWritten: 0,
    })
    expect(result.kind).not.toBe("consultant")
  })

  it("does not fire Consultant when the user actually wrote code", () => {
    const result = run({
      toolMix: { ...baseMix, edit: 50, read: 50 },
      sessions: 8,
      linesAdded: 600,
      linesWritten: 200,
    })
    expect(result.kind).not.toBe("consultant")
  })

  it("returns Shipper when commits-per-session is high and commit count clears the floor", () => {
    const result = run({
      toolMix: { ...baseMix, bash: 40, edit: 40, read: 20 },
      sessions: 6,
      commits: 12,
    })
    expect(result.kind).toBe("shipper")
    expect(result.evidence[0]).toContain("12")
    expect(result.evidence[1]).toContain("2.0")
  })

  it("does not fire Shipper when commit count is below the floor", () => {
    const result = run({
      toolMix: { ...baseMix, bash: 50, edit: 30, read: 20 },
      sessions: 2,
      commits: 4, // ratio 2.0 but count 4 < 5
    })
    expect(result.kind).not.toBe("shipper")
  })

  it("returns Tester when test runs are heavy and sustained", () => {
    const result = run({
      toolMix: { ...baseMix, bash: 60, edit: 30, read: 10 },
      sessions: 10,
      testsRun: 30,
    })
    expect(result.kind).toBe("tester")
    expect(result.evidence[0]).toContain("30")
  })

  it("returns Surgeon when Edit excess wins after baseline subtraction", () => {
    // Edit 40% → excess 25pp. Read 50% → excess 10pp.
    const result = run({
      toolMix: { ...baseMix, edit: 40, read: 50, bash: 10 },
      filesTouched: 80,
    })
    expect(result.kind).toBe("surgeon")
    expect(result.evidence[0]).toContain("40%")
  })

  it("returns Architect when Write excess wins after baseline subtraction", () => {
    // Write 20% → excess 15pp (baseline 5pp). Beats other excesses.
    const result = run({
      toolMix: { ...baseMix, write: 20, edit: 20, read: 50, bash: 10 },
    })
    expect(result.kind).toBe("architect")
    expect(result.evidence[0]).toContain("20%")
  })

  it("returns Detective when read+search excess wins after baseline subtraction", () => {
    // Read 60% (excess 20pp) + Search 25% (excess 15pp) = 35pp combined.
    const result = run({
      toolMix: { ...baseMix, read: 60, search: 25, edit: 10, bash: 5 },
    })
    expect(result.kind).toBe("detective")
    expect(result.evidence[0]).toContain("85%")
  })

  it("returns Conductor when Bash excess wins after baseline subtraction", () => {
    // Bash 60% (excess 40pp) beats anything else.
    const result = run({
      toolMix: { ...baseMix, bash: 60, read: 30, edit: 10 },
      commandsRun: 87,
      // Need to NOT hit shipper/tester rules.
      commits: 0,
      testsRun: 0,
    })
    expect(result.kind).toBe("conductor")
    expect(result.evidence[0]).toContain("60%")
    expect(result.evidence[1]).toContain("87")
  })

  it("baseline subtraction keeps the score low for a balanced mix", () => {
    // Roughly baseline-shaped mix — Read 40, Bash 20, Edit 15, Search 10,
    // Write 5, Plan 3, Research 2, Other 5. Every excess is ~0 so no
    // archetype is a clear winner — score should reflect that.
    const result = run({
      toolMix: { ...baseMix, read: 40, bash: 20, edit: 15, search: 10, write: 5, plan: 3, research: 2, other: 5 },
    })
    expect(result.score).toBeLessThan(0.2)
  })

  it("score is bounded to [0, 1]", () => {
    const conductor = run({ toolMix: { ...baseMix, bash: 100 } })
    expect(conductor.score).toBeGreaterThanOrEqual(0)
    expect(conductor.score).toBeLessThanOrEqual(1)

    const strat = run({ toolMix: { ...baseMix, plan: 80, edit: 20 } })
    expect(strat.score).toBeLessThanOrEqual(1)
  })

  it("evidence always has exactly 3 strings", () => {
    const result = run({
      toolMix: { ...baseMix, edit: 100 },
      filesTouched: 5,
    })
    expect(result.evidence).toHaveLength(3)
    for (const e of result.evidence) {
      expect(typeof e).toBe("string")
    }
  })
})
