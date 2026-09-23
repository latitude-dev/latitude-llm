import { describe, expect, it } from "vitest"
import { agentScoreImageUrl } from "./score-image-url.ts"

const DIMENSIONS = { outcome: 74, reliability: 81, cost: 52, speed: 70, safety: 92 }

describe("agentScoreImageUrl", () => {
  it("carries the score and the dimensions in composite order", () => {
    const url = new URL(agentScoreImageUrl("https://app.example", { score: 71.4, dimensions: DIMENSIONS }))

    expect(url.pathname).toBe("/api/agent-score/ring.png")
    expect(url.searchParams.get("score")).toBe("71.4")
    expect(url.searchParams.get("d")).toBe("74,81,52,70,92")
  })

  it("drops the trailing zero so equal scores share one cached image", () => {
    const url = new URL(agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS }))

    expect(url.searchParams.get("score")).toBe("71")
  })

  it("omits the dimensions when one is missing rather than shifting the rest", () => {
    const url = new URL(agentScoreImageUrl("https://app.example", { score: 71, dimensions: { outcome: 74, cost: 52 } }))

    expect(url.searchParams.has("d")).toBe(false)
  })

  it("adds the series only for the card layout", () => {
    const series = [68.9, 70, 71.4]
    const ring = new URL(agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, series }))
    const card = new URL(
      agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, series, layout: "card" }),
    )
    const slack = new URL(
      agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, series, layout: "slack" }),
    )

    expect(ring.searchParams.has("s")).toBe(false)
    expect(slack.searchParams.has("s")).toBe(false)
    expect(card.searchParams.get("s")).toBe("68.9,70,71.4")
  })

  it("names the layout, and leaves it off for the bare ring", () => {
    const at = (layout?: "ring" | "card" | "slack") =>
      new URL(
        agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, ...(layout ? { layout } : {}) }),
      ).searchParams

    expect(at().has("layout")).toBe(false)
    expect(at("ring").has("layout")).toBe(false)
    expect(at("card").get("layout")).toBe("card")
    expect(at("slack").get("layout")).toBe("slack")
  })

  it("leaves out a series with nothing to draw", () => {
    const url = new URL(
      agentScoreImageUrl("https://app.example", {
        score: 71,
        dimensions: DIMENSIONS,
        series: [71],
        layout: "card",
      }),
    )

    expect(url.searchParams.has("s")).toBe(false)
  })

  it("tolerates a trailing slash on the app url", () => {
    expect(agentScoreImageUrl("https://app.example/", { score: 71, dimensions: DIMENSIONS })).toContain(
      "https://app.example/api/agent-score/ring.png",
    )
  })
})
