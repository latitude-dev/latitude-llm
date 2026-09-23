import { SCORE_BAND_COLORS } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildScoreCardSvg, buildScoreRingSvg, buildScoreSlackCardSvg } from "./render-score-image.ts"

const WEIGHTS = { outcome: 0.35, reliability: 0.25, cost: 0.15, speed: 0.15, safety: 0.1 }

const ring = (score: number | null, dimensions: Record<string, number | null> = {}) =>
  buildScoreRingSvg({ score, dimensions, weights: WEIGHTS })

describe("buildScoreRingSvg", () => {
  it("colours the composite arc and its label by band", () => {
    expect(ring(92)).toContain(SCORE_BAND_COLORS.high)
    expect(ring(71)).toContain(SCORE_BAND_COLORS.medium)
    expect(ring(42)).toContain(SCORE_BAND_COLORS.low)
  })

  it("renders the score to one decimal, like the page it mirrors", () => {
    expect(ring(71.4)).toContain(">71.4<")
  })

  it("draws a dash for a project with no score, and no progress arc", () => {
    const svg = ring(null)
    expect(svg).toContain(">—<")
    expect(svg).toContain(SCORE_BAND_COLORS.unknown)
    expect(svg).not.toContain(SCORE_BAND_COLORS.high)
  })

  it("draws one outer track per dimension whether or not it scored", () => {
    const tracks = ring(80, { outcome: 90 }).match(/stroke-opacity="0.22"/g) ?? []
    expect(tracks).toHaveLength(5)
  })

  it("colours each outer segment by its own band, not the composite's", () => {
    const svg = ring(90, { outcome: 95, reliability: 92, cost: 40, speed: 88, safety: 91 })
    expect(svg).toContain(SCORE_BAND_COLORS.low)
    expect(svg).toContain(SCORE_BAND_COLORS.high)
  })

  it("escapes nothing it did not put there — the only text is a number", () => {
    expect(ring(50)).not.toMatch(/<text[^>]*>[^<]*[<>&][^<]*<\/text>/)
  })
})

describe("buildScoreCardSvg", () => {
  const card = (series: readonly number[]) =>
    buildScoreCardSvg({ score: 71, dimensions: { outcome: 74 }, weights: WEIGHTS, series })

  it("draws the trend when the week published more than one score", () => {
    expect(card([68, 69, 71])).toContain("Score evolution")
  })

  it("draws no trend from a single published day, which has no shape to show", () => {
    expect(card([71])).not.toContain("Score evolution")
    expect(card([])).not.toContain("Score evolution")
  })

  it("scales a flat high week to its own range rather than flattening it against 0-100", () => {
    const svg = card([97, 98, 99])
    const ys = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="3"/g)].map((match) => Number(match[1]))
    expect(new Set(ys).size).toBeGreaterThan(1)
  })
})

describe("buildScoreSlackCardSvg", () => {
  const slack = (dimensions: Record<string, number | null>) =>
    buildScoreSlackCardSvg({ score: 67.9, dimensions, weights: WEIGHTS })

  const all = { outcome: 75, reliability: 60, cost: 66, speed: 72, safety: 92 }

  it("labels every dimension, so none can fall behind a fold", () => {
    const svg = slack(all)
    for (const label of ["Outcome quality", "Reliability", "Cost", "Speed", "Safety"]) {
      expect(svg).toContain(`>${label}<`)
    }
  })

  it("prints each dimension's score in its own band colour", () => {
    const svg = slack({ ...all, cost: 40 })
    expect(svg).toMatch(new RegExp(`fill="${SCORE_BAND_COLORS.low}"[^>]*>40<`))
    expect(svg).toMatch(new RegExp(`fill="${SCORE_BAND_COLORS.high}"[^>]*>92<`))
  })

  it("draws a meter as long as the score, and none for an unmeasured dimension", () => {
    const svg = slack({ ...all, speed: null })
    const fills = svg.match(/<rect x="352"[^>]*width="(?!150")[\d.]+"[^>]*fill="#(?!E2E8F0)/g) ?? []
    expect(fills).toHaveLength(4)
    expect(svg).toContain(">—<")
  })
})
