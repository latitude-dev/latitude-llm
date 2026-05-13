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
  editAdded: 5_000,
  writeLines: 5_000,
  linesRead: 50_000,
}

const run = (overrides: Partial<typeof argsBase>) => assignPersonality({ ...argsBase, ...overrides })

describe("assignPersonality (gate-then-rank)", () => {
  it("falls back to detective when there's no activity at all", () => {
    const result = run({ toolMix: baseMix, sessions: 0 })
    expect(result.kind).toBe("detective")
    expect(result.score).toBe(0)
    expect(result.evidence[0]).toMatch(/no/i)
  })

  it("returns Strategist when planning dominates and out-scores everything", () => {
    // 30% plan share → planExcess 27pp, score = normalise(0.27, 0.05, 0.20) = 1.0.
    // Tool-mix archetypes have much smaller excesses, so Strategist wins.
    const result = run({
      toolMix: { ...baseMix, plan: 30, read: 50, edit: 10, bash: 10 },
    })
    expect(result.kind).toBe("strategist")
    expect(result.evidence[0]).toContain("30%")
  })

  it("does not fire Strategist when plan call count is below the gate floor", () => {
    // 7 plan calls < 10 floor — gate fails even though excess is high.
    const result = run({
      toolMix: { ...baseMix, plan: 7, read: 50, edit: 40, bash: 3 },
    })
    expect(result.kind).not.toBe("strategist")
  })

  it("returns Scholar when research dominates and out-scores everything", () => {
    const result = run({
      toolMix: { ...baseMix, research: 25, read: 50, edit: 15, bash: 10 },
    })
    expect(result.kind).toBe("scholar")
    expect(result.evidence[1]).toMatch(/WebFetch|WebSearch/)
  })

  it("Strategist beats Scholar when its score is higher", () => {
    // plan excess 27pp vs research excess 8pp — Strategist out-scores.
    const result = run({
      toolMix: { ...baseMix, plan: 30, research: 10, read: 50, edit: 10 },
    })
    expect(result.kind).toBe("strategist")
  })

  it("Scholar beats Strategist when its score is higher", () => {
    // Strategist gate fails (plan calls < 10). Research at 20% saturates Scholar.
    const result = run({
      toolMix: { ...baseMix, plan: 7, research: 20, read: 50, edit: 23 },
    })
    expect(result.kind).toBe("scholar")
  })

  it("returns Consultant when sessions are plentiful but barely any code was touched", () => {
    // Balanced mix so no tool-mix archetype saturates: read 50, bash 30, edit 20.
    // Detective net excess ≈ 0 (read +10pp, search −10pp), Conductor ≈ +10pp →
    // score 0.33, Surgeon +5pp → score 0.17. Consultant score 0.70 wins.
    const result = run({
      toolMix: { ...baseMix, read: 50, bash: 30, edit: 20 },
      sessions: 12,
      filesTouched: 4,
      editAdded: 0,
      writeLines: 50,
    })
    expect(result.kind).toBe("consultant")
  })

  it("does not fire Consultant when sessions are too few", () => {
    const result = run({
      toolMix: { ...baseMix, read: 50, bash: 30, edit: 20 },
      sessions: 3,
      editAdded: 0,
      writeLines: 0,
    })
    expect(result.kind).not.toBe("consultant")
  })

  it("does not fire Consultant when the user actually wrote code", () => {
    const result = run({
      toolMix: { ...baseMix, edit: 50, read: 50 },
      sessions: 8,
      editAdded: 600,
      writeLines: 200,
    })
    expect(result.kind).not.toBe("consultant")
  })

  it("returns Shipper when commits-per-session is high and commit count clears the floor", () => {
    const result = run({
      toolMix: { ...baseMix, bash: 40, edit: 40, read: 20 },
      sessions: 6,
      commits: 24, // 4 commits/session — saturates the Shipper score
    })
    expect(result.kind).toBe("shipper")
    expect(result.evidence[1]).toContain("4.0")
  })

  it("does not fire Shipper when commit count is below the floor", () => {
    const result = run({
      toolMix: { ...baseMix, bash: 50, edit: 30, read: 20 },
      sessions: 2,
      commits: 4, // ratio 2.0 but count 4 < 5 floor
    })
    expect(result.kind).not.toBe("shipper")
  })

  it("returns Tester when test runs are heavy and sustained", () => {
    const result = run({
      toolMix: { ...baseMix, bash: 60, edit: 30, read: 10 },
      sessions: 10,
      testsRun: 80, // 8 tests/session — saturates the Tester score
    })
    expect(result.kind).toBe("tester")
    expect(result.evidence[0]).toContain("80")
  })

  it("weakly-firing Strategist loses to strongly-firing Shipper (gate-then-rank)", () => {
    // Strategist passes its gate just barely — 10 plan calls, 7pp excess.
    // Score = normalise(0.07, 0.05, 0.20) ≈ 0.13. Shipper crushes it with
    // 3.0 commits/session — score = normalise(3.0, 1.0, 4.0) ≈ 0.67. This
    // is exactly the case that motivated gate-then-rank vs strict priority.
    const result = run({
      toolMix: { ...baseMix, plan: 10, read: 50, edit: 32, bash: 8 },
      sessions: 8,
      commits: 24,
    })
    expect(result.kind).toBe("shipper")
  })

  it("returns Surgeon when Edit excess wins after baseline subtraction", () => {
    const result = run({
      toolMix: { ...baseMix, edit: 40, read: 50, bash: 10 },
      filesTouched: 80,
    })
    expect(result.kind).toBe("surgeon")
    expect(result.evidence[0]).toContain("40%")
  })

  it("returns Architect when Write excess wins after baseline subtraction", () => {
    // Write 25% → excess 20pp; Detective (read 50 → 10pp, search 0 → -10pp) = 0.
    const result = run({
      toolMix: { ...baseMix, write: 25, edit: 15, read: 50, bash: 10 },
    })
    expect(result.kind).toBe("architect")
    expect(result.evidence[0]).toContain("25%")
  })

  it("returns Detective when read+search excess wins after baseline subtraction", () => {
    // Read 60% (excess 20pp) + Search 25% (excess 15pp) = 35pp combined.
    const result = run({
      toolMix: { ...baseMix, read: 60, search: 25, edit: 10, bash: 5 },
    })
    expect(result.kind).toBe("detective")
    expect(result.evidence[0]).toContain("85%")
  })

  it("returns Conductor when Bash excess wins", () => {
    // Bash 60% (excess 40pp) saturates Conductor's score to 1.0.
    const result = run({
      toolMix: { ...baseMix, bash: 60, read: 30, edit: 10 },
      commandsRun: 87,
    })
    expect(result.kind).toBe("conductor")
    expect(result.evidence[0]).toContain("60%")
    expect(result.evidence[1]).toContain("87")
  })

  it("score is bounded to [0, 1]", () => {
    const conductor = run({ toolMix: { ...baseMix, bash: 100 } })
    expect(conductor.score).toBeGreaterThanOrEqual(0)
    expect(conductor.score).toBeLessThanOrEqual(1)

    const strat = run({ toolMix: { ...baseMix, plan: 80, edit: 20 } })
    expect(strat.score).toBeLessThanOrEqual(1)
    expect(strat.score).toBeGreaterThan(0.5)
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
