import { describe, expect, it } from "vitest"
import type { CacheEconomics, CacheModelUsage } from "../ports/cost-analytics-repository.ts"
import { CACHE_CEILING_LIFETIME_SECONDS } from "./cache-ceiling.ts"
import { type JudgedCacheModel, judgeCacheEconomics } from "./judge-cache-economics.ts"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const usage = (overrides: Partial<CacheModelUsage> = {}): CacheModelUsage => ({
  model: "claude-opus-4-5",
  provider: "anthropic",
  calls: 400,
  inputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  costMicrocents: 500_000_000,
  unpricedCalls: 0,
  unpricedTokens: 0,
  ...overrides,
})

/** Warm at every lifetime from `warmFrom` upward, mirroring the query's cumulative buckets. */
const histogram = (cacheableTokens: number, warmTokens: number, warmFromSeconds: number) => ({
  cacheableTokens,
  calls: 0,
  warmTokensByLifetime: Object.fromEntries(
    CACHE_CEILING_LIFETIME_SECONDS.map((s) => [s, s >= warmFromSeconds ? warmTokens : 0]),
  ),
  warmCallsByLifetime: Object.fromEntries(CACHE_CEILING_LIFETIME_SECONDS.map((s) => [s, 0])),
})

const judge = (
  overrides: Partial<CacheModelUsage> = {},
  cadence?: ReturnType<typeof histogram>,
  windowMs = WEEK_MS,
): JudgedCacheModel => {
  const row = usage(overrides)
  const economics: CacheEconomics = {
    rows: [row],
    cadence: cadence ? [{ provider: row.provider, model: row.model, ...cadence }] : [],
    totals: {
      calls: row.calls,
      inputTokens: row.inputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheCreateTokens: row.cacheCreateTokens,
      costMicrocents: row.costMicrocents,
      unpricedCalls: 0,
      unpricedTokens: 0,
      distinctModels: 1,
    },
  }
  const judged = judgeCacheEconomics({ economics, windowMs })[0]
  if (!judged) throw new Error("no judgment")
  return judged
}

describe("judgeCacheEconomics", () => {
  it("reads the ceiling from cadence and the break-even from the registry", () => {
    const judged = judge({}, histogram(1_000_000, 900_000, 60))

    expect(judged.documented.ceilingRate).toBeCloseTo(0.9, 4)
    expect(judged.documented.breakEvenRate).toBeCloseTo(0.2174, 4)
    expect(judged.documentedLifetimeSeconds).toBe(300)
  })

  it("leaves the ceiling unknown when no cadence row came back for the pair", () => {
    expect(judge().documented.ceilingRate).toBeNull()
  })

  it("refuses a ceiling for a model with no documented lifetime, cadence or not", () => {
    // The fallback question: an unlisted pair must not inherit someone else's window.
    // A cadence row is supplied on purpose — the null lifetime is what stops it.
    const judged = judge(
      { provider: "some-gateway", model: "mystery-1", inputTokens: 900_000, cacheReadTokens: 100_000 },
      histogram(1_000_000, 990_000, 60),
    )

    expect(judged.documentedLifetimeSeconds).toBeNull()
    expect(judged.documented.ceilingRate).toBeNull()
    // Still exact where it can be: the measured rate needs no lifetime.
    expect(judged.documented.actualRate).toBeCloseTo(0.1, 4)
  })

  it("gives a best-effort cache no documented ceiling, so its rows cannot become findings", () => {
    const judged = judge(
      { provider: "google", model: "gemini-2.5-flash", inputTokens: 200_000, cacheReadTokens: 800_000 },
      histogram(1_000_000, 1_000_000, 60),
    )

    expect(judged.documentedLifetimeSeconds).toBeNull()
    expect(judged.documented.ceilingRate).toBeNull()
    expect(judged.documented.state).toBe("optimal")
    expect(judged.documented.modeledSavingsMicrocents).toBeNull()
  })

  it("resolves the documented lifetime per model, so one provider's families do not share one", () => {
    const cadence = histogram(1_000_000, 830_000, 60)
    expect(judge({ provider: "openai", model: "gpt-5.6-luna" }, cadence).documentedLifetimeSeconds).toBe(1_800)
    expect(judge({ provider: "openai", model: "gpt-5-mini" }, cadence).documentedLifetimeSeconds).toBe(300)
  })

  describe("per-lifetime exploration", () => {
    it("judges every offered lifetime, not only the documented one", () => {
      const judged = judge({}, histogram(1_000_000, 900_000, 60))

      expect(
        Object.keys(judged.byLifetimeSeconds)
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual([...CACHE_CEILING_LIFETIME_SECONDS])
      for (const lifetimeSeconds of CACHE_CEILING_LIFETIME_SECONDS) {
        expect(judged.byLifetimeSeconds[lifetimeSeconds]?.ceilingRate).toBeCloseTo(0.9, 4)
      }
    })

    it("moves the ceiling with the assumed lifetime, and flags that the verdict depends on it", () => {
      // Ten-minute gaps: nothing is warm at five minutes, everything from thirty on.
      const judged = judge(
        {
          model: "gpt-5.6-luna",
          provider: "openai",
          inputTokens: 680_000,
          cacheReadTokens: 80_000,
          cacheCreateTokens: 240_000,
        },
        histogram(1_000_000, 833_000, 1_800),
      )

      expect(judged.byLifetimeSeconds[300]?.ceilingRate).toBe(0)
      expect(judged.byLifetimeSeconds[1_800]?.ceilingRate).toBeCloseTo(0.833, 3)
      // At five minutes the cadence looks hopeless; at the documented thirty it is fixable.
      expect(judged.byLifetimeSeconds[300]?.state).toBe("stopCaching")
      expect(judged.byLifetimeSeconds[1_800]).toMatchObject({ state: "investigate", urgency: "overpaying" })
      expect(judged.documented.state).toBe("investigate")
      expect(judged.verdictDependsOnLifetime).toBe(true)
    })

    it("reports no dependence when every lifetime agrees, which is most traffic", () => {
      // Warm at the shortest lifetime already, so nothing longer changes anything.
      const judged = judge({ inputTokens: 130_000, cacheReadTokens: 870_000 }, histogram(1_000_000, 916_000, 60))

      expect(judged.verdictDependsOnLifetime).toBe(false)
      expect(judged.documented.state).toBe("optimal")
    })

    it("prices every lifetime from the registry, so the client needs no pricing to switch", () => {
      const judged = judge(
        { model: "gpt-5-mini", provider: "openai", inputTokens: 20_000_000, calls: 800 },
        histogram(20_000_000, 16_600_000, 1_800),
      )

      expect(judged.byLifetimeSeconds[300]?.modeledSavingsMicrocents).toBeNull()
      expect(judged.byLifetimeSeconds[1_800]?.modeledSavingsMicrocents).toBeGreaterThan(0)
      expect(judged.byLifetimeSeconds[1_800]?.savingsClearsFloor).toBe(true)
    })
  })

  describe("the documented verdict", () => {
    it("says stop caching once the documented ceiling proves break-even is out of reach", () => {
      const judged = judge(
        {
          model: "gpt-5.6",
          provider: "openai",
          inputTokens: 6_700_000,
          cacheReadTokens: 500_000,
          cacheCreateTokens: 2_800_000,
        },
        histogram(10_000_000, 0, 60),
      )

      expect(judged.documented).toMatchObject({ state: "stopCaching", urgency: "overpaying" })
      expect(judged.documented.modeledSavingsMicrocents).toBeGreaterThan(0)
    })

    it("leaves a healthy model blank rather than reporting nothing to save as zero", () => {
      const judged = judge({ inputTokens: 130_000, cacheReadTokens: 870_000 }, histogram(1_000_000, 916_700, 60))

      expect(judged.documented.state).toBe("optimal")
      expect(judged.documented.modeledSavingsMicrocents).toBeNull()
      expect(judged.documented.savingsClearsFloor).toBe(false)
    })

    it("makes no claim about a model the pricing registry has never heard of", () => {
      const judged = judge({ provider: "some-gateway", model: "mystery-1" }, histogram(1_000_000, 900_000, 60))

      expect(judged.documented.state).toBe("notEnoughData")
      expect(judged.documented.breakEvenRate).toBeNull()
      expect(judged.documented.modeledSavingsMicrocents).toBeNull()
    })

    it("keeps a real finding out of the cards when the money behind it is noise", () => {
      const judged = judge(
        { model: "gpt-5-mini", provider: "openai", inputTokens: 40_000, calls: 20 },
        histogram(40_000, 33_200, 60),
      )

      expect(judged.documented.state).toBe("cacheIt")
      expect(judged.documented.modeledSavingsMicrocents).toBeGreaterThan(0)
      expect(judged.documented.savingsClearsFloor).toBe(false)
    })

    it("scales the floor to the window, so a short window is not silently emptied", () => {
      const flow = { model: "gpt-5-mini", provider: "openai", inputTokens: 1_400_000, calls: 40 } as const
      const cadence = histogram(1_400_000, 1_160_000, 60)

      expect(judge(flow, cadence, WEEK_MS * 12).documented.savingsClearsFloor).toBe(false)
      expect(judge(flow, cadence, WEEK_MS / 7).documented.savingsClearsFloor).toBe(true)
    })
  })
})
