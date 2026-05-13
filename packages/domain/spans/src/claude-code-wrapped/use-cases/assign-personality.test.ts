import { describe, expect, it } from "vitest"
import type { ToolMix } from "../entities/report.ts"
import { assignPersonality } from "./assign-personality.ts"

const baseMix: ToolMix = { bash: 0, read: 0, edit: 0, write: 0, search: 0, plan: 0, other: 0 }

const run = (overrides: Partial<typeof argsBase>) => assignPersonality({ ...argsBase, ...overrides })

const argsBase = {
  toolMix: baseMix,
  sessions: 10,
  totalDurationMs: 10 * 60 * 1000, // 1 minute avg — well under Marathoner
  filesTouched: 0,
  commandsRun: 0,
}

describe("assignPersonality", () => {
  it("falls back to detective when there's no activity at all", () => {
    const result = run({ toolMix: baseMix, sessions: 0, totalDurationMs: 0 })
    expect(result.kind).toBe("detective")
    expect(result.score).toBe(0)
    expect(result.evidence[0]).toMatch(/no/i)
  })

  it("returns Strategist when planning share is at least 15%", () => {
    const result = run({
      toolMix: { ...baseMix, plan: 30, edit: 70 },
      filesTouched: 12,
    })
    expect(result.kind).toBe("strategist")
    expect(result.score).toBeGreaterThan(0)
    expect(result.evidence[0]).toContain("30%")
    expect(result.evidence[1]).toContain("30")
  })

  it("returns Marathoner when avg session ≥ 45 minutes", () => {
    const result = run({
      toolMix: { ...baseMix, edit: 100 },
      sessions: 2,
      totalDurationMs: 2 * 60 * 60 * 1000, // 2 sessions, 1 hour each
    })
    expect(result.kind).toBe("marathoner")
    expect(result.score).toBeGreaterThan(0)
    expect(result.evidence[0]).toContain("1 hour")
  })

  it("Strategist beats Marathoner when both rules would fire", () => {
    const result = run({
      toolMix: { ...baseMix, plan: 30, edit: 70 },
      sessions: 2,
      totalDurationMs: 2 * 60 * 60 * 1000,
    })
    expect(result.kind).toBe("strategist")
  })

  it("returns Surgeon when Edit dominates the tool mix", () => {
    const result = run({
      toolMix: { ...baseMix, edit: 60, read: 20, bash: 10, search: 10 },
      filesTouched: 142,
    })
    expect(result.kind).toBe("surgeon")
    expect(result.evidence[0]).toContain("60%")
    expect(result.evidence[1]).toContain("142")
  })

  it("returns Architect when Write dominates the tool mix", () => {
    const result = run({
      toolMix: { ...baseMix, write: 50, edit: 20, read: 20, bash: 10 },
    })
    expect(result.kind).toBe("architect")
    expect(result.evidence[0]).toContain("50%")
  })

  it("returns Detective when Read + Search dominate", () => {
    // Detective is read+search combined, so this beats a slightly higher edit.
    const result = run({
      toolMix: { ...baseMix, read: 30, search: 20, edit: 25, bash: 25 },
    })
    expect(result.kind).toBe("detective")
    expect(result.evidence[0]).toContain("50%")
  })

  it("returns Conductor when Bash dominates", () => {
    const result = run({
      toolMix: { ...baseMix, bash: 55, read: 25, edit: 20 },
      commandsRun: 87,
    })
    expect(result.kind).toBe("conductor")
    expect(result.evidence[0]).toContain("55%")
    expect(result.evidence[1]).toContain("87")
  })

  it("breaks ties deterministically in Surgeon > Architect > Detective > Conductor order", () => {
    // edit and write tied at 50% each — Surgeon wins by stable-sort order.
    const result = run({
      toolMix: { ...baseMix, edit: 50, write: 50 },
    })
    expect(result.kind).toBe("surgeon")
  })

  it("score is bounded to [0, 1]", () => {
    const conductor = run({ toolMix: { ...baseMix, bash: 100 } })
    expect(conductor.score).toBeGreaterThanOrEqual(0)
    expect(conductor.score).toBeLessThanOrEqual(1)

    const stratHigh = run({ toolMix: { ...baseMix, plan: 80, edit: 20 } })
    expect(stratHigh.score).toBeLessThanOrEqual(1)
  })

  it("evidence always has exactly 3 strings", () => {
    const result = run({ toolMix: { ...baseMix, edit: 100 }, filesTouched: 5 })
    expect(result.evidence).toHaveLength(3)
    for (const e of result.evidence) {
      expect(typeof e).toBe("string")
    }
  })
})
