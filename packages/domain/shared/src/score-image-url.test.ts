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

  const TREND = {
    from: "2026-09-17",
    to: "2026-09-23",
    points: [
      { date: "2026-09-17", score: 68.9 },
      { date: "2026-09-18", score: 70 },
      { date: "2026-09-23", score: 71.4 },
    ],
  }

  it("adds the trend only for the card layout", () => {
    const ring = new URL(agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, trend: TREND }))
    const card = new URL(
      agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, trend: TREND, layout: "card" }),
    )
    const slack = new URL(
      agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, trend: TREND, layout: "slack" }),
    )

    expect(ring.searchParams.has("s")).toBe(false)
    expect(slack.searchParams.has("s")).toBe(false)
    expect(card.searchParams.has("s")).toBe(true)
  })

  it("gives every day of the window its own slot, leaving unscored days empty", () => {
    const card = new URL(
      agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, trend: TREND, layout: "card" }),
    )

    expect(card.searchParams.get("s")).toBe("68.9,70,,,,,71.4")
  })

  it("places points by their date, whatever order they arrive in", () => {
    const shuffled = { ...TREND, points: [...TREND.points].reverse() }
    const card = new URL(
      agentScoreImageUrl("https://app.example", { score: 71, dimensions: DIMENSIONS, trend: shuffled, layout: "card" }),
    )

    expect(card.searchParams.get("s")).toBe("68.9,70,,,,,71.4")
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

  it("leaves out a trend with nothing to draw", () => {
    const url = new URL(
      agentScoreImageUrl("https://app.example", {
        score: 71,
        dimensions: DIMENSIONS,
        trend: { from: "2026-09-17", to: "2026-09-23", points: [{ date: "2026-09-20", score: 71 }] },
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
