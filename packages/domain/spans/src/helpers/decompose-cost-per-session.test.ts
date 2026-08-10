import { describe, expect, it } from "vitest"
import {
  decomposeCostPerSession,
  SESSION_COST_MIN_SESSIONS,
  type SessionCostCell,
  type SessionCostFactor,
  type SessionCostPeriod,
} from "./decompose-cost-per-session.ts"

interface ModelSpec {
  readonly name: string
  /** Share of the period's tokens this model takes. */
  readonly share: number
  /** Share of *this model's* tokens that are prompt tokens. */
  readonly promptShare: number
  readonly promptPrice: number
  readonly outputPrice: number
}

/** A period built from the factors themselves, so a test can move exactly one of them. */
const period = ({
  sessions,
  tracesPerSession,
  callsPerTrace,
  tokensPerCall,
  models,
  traceKeyedSessions = 0,
}: {
  sessions: number
  tracesPerSession: number
  callsPerTrace: number
  tokensPerCall: number
  models: readonly ModelSpec[]
  traceKeyedSessions?: number
}): SessionCostPeriod => {
  const traces = sessions * tracesPerSession
  const calls = traces * callsPerTrace
  const tokens = calls * tokensPerCall
  const cells: SessionCostCell[] = models.flatMap((model) => {
    const own = tokens * model.share
    const prompt = own * model.promptShare
    const output = own - prompt
    return [
      {
        provider: "acme",
        model: model.name,
        side: "prompt",
        tokens: prompt,
        costMicrocents: prompt * model.promptPrice,
      },
      {
        provider: "acme",
        model: model.name,
        side: "output",
        tokens: output,
        costMicrocents: output * model.outputPrice,
      },
    ].filter((cell): cell is SessionCostCell => cell.tokens > 0)
  })
  return { sessions, traceKeyedSessions, traces, calls, unpricedCalls: 0, cells }
}

const CHEAP: ModelSpec = { name: "mini", share: 1, promptShare: 0.9, promptPrice: 10, outputPrice: 100 }
const DEAR = { name: "opus", promptShare: 0.9, promptPrice: 100, outputPrice: 1_000 }

const BASELINE = {
  sessions: 400,
  tracesPerSession: 3,
  callsPerTrace: 2,
  tokensPerCall: 1_000,
  models: [CHEAP],
} as const

const multiplierFor = (
  rows: readonly { factor: SessionCostFactor; multiplier: number }[],
  factor: SessionCostFactor,
): number | undefined => rows.find((row) => row.factor === factor)?.multiplier

const factors = (rows: readonly { factor: SessionCostFactor }[]): SessionCostFactor[] => rows.map((row) => row.factor)

const product = (rows: readonly { multiplier: number }[]): number =>
  rows.reduce((total, row) => total * row.multiplier, 1)

describe("decomposeCostPerSession", () => {
  it("gives every factor its own before/after ratio as a multiplier", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, tracesPerSession: 6 }),
    })

    expect(result.status).toBe("ok")
    expect(result.totalMultiplier).toBeCloseTo(2, 10)
    expect(multiplierFor(result.rows, "tracesPerSession")).toBeCloseTo(2, 2)
    expect(result.changePct).toBeCloseTo(100, 10)
  })

  it("multiplies the displayed rows to the displayed total", () => {
    const cases = [
      { tracesPerSession: 3.7, callsPerTrace: 2.3, tokensPerCall: 1_311, promptPrice: 13 },
      { tracesPerSession: 2.9, callsPerTrace: 1.1, tokensPerCall: 907, promptPrice: 7 },
      { tracesPerSession: 3.01, callsPerTrace: 2.02, tokensPerCall: 1_003, promptPrice: 10.1 },
      { tracesPerSession: 11, callsPerTrace: 5, tokensPerCall: 40_000, promptPrice: 91 },
    ]

    for (const shape of cases) {
      const result = decomposeCostPerSession({
        previous: period(BASELINE),
        current: period({
          sessions: 517,
          tracesPerSession: shape.tracesPerSession,
          callsPerTrace: shape.callsPerTrace,
          tokensPerCall: shape.tokensPerCall,
          models: [{ ...CHEAP, promptPrice: shape.promptPrice }],
        }),
      })

      // Exactly, not to display precision: each multiplier is exp of a log share and
      // the shares sum to the total's log, so the product is the total by construction.
      const drift = Math.abs(product(result.rows) / (result.totalMultiplier ?? 1) - 1)
      expect(drift, JSON.stringify(shape)).toBeLessThan(1e-9)
    }
  })

  it("attributes prompt growth to tokens per call, with the price rows quiet", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, tokensPerCall: 4_000 }),
    })

    expect(multiplierFor(result.rows, "tokensPerCall")).toBeCloseTo(4, 2)
    expect(multiplierFor(result.rows, "modelMix")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "promptRate")).toBeCloseTo(1, 2)
  })

  it("puts a migration to a cheaper model on model mix, not on either rate", () => {
    const cheap = { name: "haiku", promptShare: 0.9, promptPrice: 10, outputPrice: 100 }
    const result = decomposeCostPerSession({
      previous: period({
        ...BASELINE,
        models: [
          { ...DEAR, share: 0.8 },
          { ...cheap, share: 0.2 },
        ],
      }),
      current: period({
        ...BASELINE,
        models: [
          { ...DEAR, share: 0.2 },
          { ...cheap, share: 0.8 },
        ],
      }),
    })

    expect(result.totalMultiplier).toBeLessThan(1)
    expect(multiplierFor(result.rows, "modelMix")).toBeLessThan(1)
    // No price list changed, so neither rate row may claim credit.
    expect(multiplierFor(result.rows, "promptRate")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "outputRate")).toBeCloseTo(1, 2)
  })

  it("puts a real price rise on the rate rows, not on either mix row", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, models: [{ ...CHEAP, promptPrice: 20, outputPrice: 200 }] }),
    })

    expect(multiplierFor(result.rows, "promptRate")).toBeGreaterThan(1)
    expect(multiplierFor(result.rows, "modelMix")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "tokenMix")).toBeCloseTo(1, 2)
  })

  /**
   * The defect the four-way price split exists to fix: prompt tokens are cheaper
   * than output ones, so growing the prompt alone drags the blended per-token price
   * down. That has to read as a mix shift, never as a rate cut.
   */
  it("charges a prompt/output shift to token mix and leaves both rates quiet", () => {
    const result = decomposeCostPerSession({
      previous: period({ ...BASELINE, models: [{ ...CHEAP, promptShare: 0.5 }] }),
      current: period({ ...BASELINE, models: [{ ...CHEAP, promptShare: 0.95 }] }),
    })

    expect(multiplierFor(result.rows, "tokenMix")).toBeLessThan(1)
    expect(multiplierFor(result.rows, "promptRate")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "outputRate")).toBeCloseTo(1, 2)
    expect(multiplierFor(result.rows, "modelMix")).toBeCloseTo(1, 2)
  })

  it("keeps a model-share shift out of the token mix row when each model's split holds", () => {
    const result = decomposeCostPerSession({
      previous: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.9 },
          { ...DEAR, share: 0.1 },
        ],
      }),
      current: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.1 },
          { ...DEAR, share: 0.9 },
        ],
      }),
    })

    expect(multiplierFor(result.rows, "modelMix")).toBeGreaterThan(1)
    expect(multiplierFor(result.rows, "tokenMix")).toBeCloseTo(1, 2)
  })

  it("names where the tokens went, not the model they drained out of", () => {
    // Two traps at once: mini loses the most share, and sonnet gains more of it than
    // opus does. Neither should be named — mini's share is falling while the row
    // rises, and sonnet's cheaper gain moves the blend less than opus's dearer one.
    const mid = { name: "sonnet", promptShare: 0.9, promptPrice: 50, outputPrice: 500 }
    const result = decomposeCostPerSession({
      previous: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.7 },
          { ...mid, share: 0.2 },
          { ...DEAR, share: 0.1 },
        ],
      }),
      current: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.1 },
          { ...mid, share: 0.45 },
          { ...DEAR, share: 0.45 },
        ],
      }),
    })

    const row = result.rows.find((candidate) => candidate.factor === "modelMix")
    expect(row?.subject).toBe("acme/opus")
    expect(row?.current).toBeCloseTo(0.45, 6)
  })

  it("counts the other models that also gained, so one name cannot pass for the whole shift", () => {
    const mid = { name: "sonnet", promptShare: 0.9, promptPrice: 50, outputPrice: 500 }
    const result = decomposeCostPerSession({
      previous: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.8 },
          { ...mid, share: 0.1 },
          { ...DEAR, share: 0.1 },
        ],
      }),
      current: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.2 },
          { ...mid, share: 0.4 },
          { ...DEAR, share: 0.4 },
        ],
      }),
    })

    // Two models gained 30 points each: the tile names one and says so.
    expect(result.rows.find((row) => row.factor === "modelMix")?.alsoMoved).toBe(1)
  })

  it("counts no other movers when a single model took all the traffic", () => {
    const result = decomposeCostPerSession({
      previous: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.9 },
          { ...DEAR, share: 0.1 },
        ],
      }),
      current: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.1 },
          { ...DEAR, share: 0.9 },
        ],
      }),
    })

    expect(result.rows.find((row) => row.factor === "modelMix")?.alsoMoved).toBe(0)
  })

  it("names the cheaper destination when traffic migrates down", () => {
    const cheap = { name: "haiku", promptShare: 0.9, promptPrice: 1, outputPrice: 10 }
    const result = decomposeCostPerSession({
      previous: period({
        ...BASELINE,
        models: [
          { ...DEAR, share: 0.9 },
          { ...cheap, share: 0.1 },
        ],
      }),
      current: period({
        ...BASELINE,
        models: [
          { ...DEAR, share: 0.1 },
          { ...cheap, share: 0.9 },
        ],
      }),
    })

    const row = result.rows.find((candidate) => candidate.factor === "modelMix")
    expect(row?.subject).toBe("acme/haiku")
    expect(row?.multiplier).toBeLessThan(1)
  })

  it("always reports all seven factors, so the card's shape never moves", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, tokensPerCall: 4_000 }),
    })

    expect(factors(result.rows).sort()).toEqual(
      ["callsPerTrace", "modelMix", "outputRate", "promptRate", "tokenMix", "tokensPerCall", "tracesPerSession"].sort(),
    )
  })

  it("orders rows by how far each moved so the cause reads first", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, tracesPerSession: 3.3, tokensPerCall: 3_000 }),
    })

    expect(result.rows[0]?.factor).toBe("tokensPerCall")
  })

  it("reports where every factor stands now, in that factor's own unit", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, tracesPerSession: 6, models: [{ ...CHEAP, promptPrice: 20 }] }),
    })
    const currentOf = (factor: SessionCostFactor) => result.rows.find((row) => row.factor === factor)?.current

    expect(currentOf("tracesPerSession")).toBeCloseTo(6, 6)
    expect(currentOf("callsPerTrace")).toBeCloseTo(2, 6)
    expect(currentOf("tokensPerCall")).toBeCloseTo(1_000, 6)
    // Microcents per token on each side, blended over models.
    expect(currentOf("promptRate")).toBeCloseTo(20, 6)
    expect(currentOf("outputRate")).toBeCloseTo(100, 6)
    // Shares, so the mix tiles have a figure of their own to stand on.
    expect(currentOf("tokenMix")).toBeCloseTo(0.9, 6)
  })

  it("reports flat rather than dividing by a near-zero log", () => {
    const result = decomposeCostPerSession({ previous: period(BASELINE), current: period(BASELINE) })

    expect(result.status).toBe("flat")
    expect(result.rows).toEqual([])
    expect(result.changePct).toBe(0)
  })

  it("refuses to compare when either period is under the session floor", () => {
    const small = period({ ...BASELINE, sessions: SESSION_COST_MIN_SESSIONS - 1 })
    const big = period({ ...BASELINE, tracesPerSession: 6 })

    expect(decomposeCostPerSession({ previous: small, current: big }).status).toBe("notEnoughData")
    expect(decomposeCostPerSession({ previous: big, current: small }).status).toBe("notEnoughData")
    expect(decomposeCostPerSession({ previous: small, current: big }).changePct).toBeNull()
    expect(decomposeCostPerSession({ previous: small, current: big }).totalMultiplier).toBeNull()
  })

  it("refuses to compare when the previous period recorded no spend", () => {
    const free = period({ ...BASELINE, models: [{ ...CHEAP, promptPrice: 0, outputPrice: 0 }] })
    const result = decomposeCostPerSession({ previous: free, current: period(BASELINE) })

    expect(result.status).toBe("notEnoughData")
    // The headline still renders — only the comparison is withheld.
    expect(result.currentCostPerSessionMicrocents).toBeGreaterThan(0)
  })

  it("reports the session-count change without letting it move a row", () => {
    const result = decomposeCostPerSession({
      previous: period(BASELINE),
      current: period({ ...BASELINE, sessions: BASELINE.sessions * 2 }),
    })

    expect(result.volume).toEqual({ previousSessions: 400, currentSessions: 800 })
    expect(result.status).toBe("flat")
  })

  it("charges a new model's price gap against the old blend to the rate factors", () => {
    // Its share arriving is mix-neutral, because the baseline is the old blended price.
    // Whatever it costs beyond that blend is a price difference, so it lands on a rate.
    const result = decomposeCostPerSession({
      previous: period({ ...BASELINE, models: [{ ...CHEAP, share: 1 }] }),
      current: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.5 },
          { ...DEAR, name: "brand-new", share: 0.5 },
        ],
      }),
    })

    expect(multiplierFor(result.rows, "promptRate")).toBeGreaterThan(1)
    expect(multiplierFor(result.rows, "tokenMix")).toBeCloseTo(1, 6)
  })

  it("baselines a model with no previous tokens at the previous blended price", () => {
    const result = decomposeCostPerSession({
      previous: period({ ...BASELINE, models: [{ ...CHEAP, share: 1 }] }),
      current: period({
        ...BASELINE,
        models: [
          { ...CHEAP, share: 0.5 },
          { ...CHEAP, name: "brand-new", share: 0.5 },
        ],
      }),
    })

    // Routing half the traffic to an identically-priced model changes nothing.
    expect(result.status).toBe("flat")
  })
})
