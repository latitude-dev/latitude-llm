import { describe, expect, it } from "vitest"
import { parseScoreParams } from "./parse-score-params.ts"

const parse = (query: string) => parseScoreParams(new URL(`https://app.example/api/agent-score/ring.png?${query}`))

describe("parseScoreParams", () => {
  it("keeps an unscored day in its own slot so later days stay on their dates", () => {
    expect(parse("score=71&s=68.9,70,,,,,71.4").series).toEqual([68.9, 70, null, null, null, null, 71.4])
  })

  it("keeps a missing dimension from shifting the ones after it", () => {
    expect(parse("score=71&d=74,,52,70,92").dimensions).toEqual({
      outcome: 74,
      reliability: null,
      cost: 52,
      speed: 70,
      safety: 92,
    })
  })

  it("clamps scores into 0-100 and treats garbage as an empty slot", () => {
    expect(parse("score=150&s=-5,abc,40").series).toEqual([0, null, 40])
    expect(parse("score=150").score).toBe(100)
  })

  it("caps the series so a crafted URL cannot ask for thousands of points", () => {
    const long = Array.from({ length: 100 }, () => "50").join(",")
    expect(parse(`score=50&s=${long}`).series).toHaveLength(31)
  })

  it("reads an absent series as no trend at all", () => {
    expect(parse("score=71").series).toEqual([])
  })
})
