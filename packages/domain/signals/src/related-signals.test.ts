import type { SignalCoOccurrenceAggregate } from "@domain/scores"
import { SignalId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { SIGNAL_RELATED_SEMANTIC_CEILING, SIGNAL_RELATED_SEMANTIC_FLOOR } from "./constants.ts"
import {
  combinedRelatedness,
  coOccurrenceRelatednessScore,
  rankRelatedSignals,
  semanticRelatednessScore,
} from "./related-signals.ts"

const signalA = SignalId("a".repeat(24))
const signalB = SignalId("b".repeat(24))
const signalC = SignalId("c".repeat(24))
const signalD = SignalId("d".repeat(24))

const emptyCoOccurrence: SignalCoOccurrenceAggregate = {
  mySessions: 0,
  totalSessions: 0,
  candidates: [],
}

describe("semanticRelatednessScore", () => {
  it("clamps below the floor to 0 and above the ceiling to 1", () => {
    expect(semanticRelatednessScore(SIGNAL_RELATED_SEMANTIC_FLOOR)).toBe(0)
    expect(semanticRelatednessScore(0.2)).toBe(0)
    expect(semanticRelatednessScore(-1)).toBe(0)
    expect(semanticRelatednessScore(SIGNAL_RELATED_SEMANTIC_CEILING)).toBe(1)
    expect(semanticRelatednessScore(0.99)).toBe(1)
  })

  it("rescales linearly inside the band", () => {
    const mid = (SIGNAL_RELATED_SEMANTIC_FLOOR + SIGNAL_RELATED_SEMANTIC_CEILING) / 2
    expect(semanticRelatednessScore(mid)).toBeCloseTo(0.5, 10)
    expect(semanticRelatednessScore(0.7)).toBeCloseTo(
      (0.7 - SIGNAL_RELATED_SEMANTIC_FLOOR) / (SIGNAL_RELATED_SEMANTIC_CEILING - SIGNAL_RELATED_SEMANTIC_FLOOR),
      10,
    )
  })
})

describe("coOccurrenceRelatednessScore", () => {
  it("returns 0 under the shared-session floor", () => {
    expect(
      coOccurrenceRelatednessScore({ sharedSessions: 2, mySessions: 10, theirSessions: 10, totalSessions: 1000 }),
    ).toBe(0)
  })

  it("returns 0 at chance-level overlap (lift = 1), even when the overlap percent is high", () => {
    // Two big issues overlapping exactly as much as independence predicts.
    expect(
      coOccurrenceRelatednessScore({ sharedSessions: 250, mySessions: 500, theirSessions: 500, totalSessions: 1000 }),
    ).toBe(0)
    // The big-neighbor trap: 90% of my sessions shared, but the neighbor covers
    // 90% of the universe — pure chance, no association.
    expect(
      coOccurrenceRelatednessScore({ sharedSessions: 54, mySessions: 60, theirSessions: 900, totalSessions: 1000 }),
    ).toBe(0)
  })

  it("scores a perfectly co-occurring rare pair at 1", () => {
    expect(
      coOccurrenceRelatednessScore({ sharedSessions: 10, mySessions: 10, theirSessions: 10, totalSessions: 1000 }),
    ).toBeCloseTo(1, 10)
  })

  it("scores partial above-chance association between 0 and 1", () => {
    // pBoth = 0.01, pMine = 0.03, pTheirs = 0.02 → lift ≈ 16.7,
    // NPMI = ln(16.7) / −ln(0.01) ≈ 0.61.
    const score = coOccurrenceRelatednessScore({
      sharedSessions: 20,
      mySessions: 60,
      theirSessions: 40,
      totalSessions: 2000,
    })
    expect(score).toBeCloseTo(Math.log(50 / 3) / -Math.log(0.01), 10)
    expect(score).toBeGreaterThan(0.5)
    expect(score).toBeLessThan(0.7)
  })

  it("guards degenerate inputs", () => {
    expect(
      coOccurrenceRelatednessScore({ sharedSessions: 5, mySessions: 0, theirSessions: 5, totalSessions: 100 }),
    ).toBe(0)
    expect(coOccurrenceRelatednessScore({ sharedSessions: 5, mySessions: 5, theirSessions: 5, totalSessions: 0 })).toBe(
      0,
    )
    // Both issues in every session: necessity, not association.
    expect(
      coOccurrenceRelatednessScore({ sharedSessions: 10, mySessions: 10, theirSessions: 10, totalSessions: 10 }),
    ).toBe(0)
  })
})

describe("combinedRelatedness", () => {
  it("passes a lone signal through and boosts dual signals above either", () => {
    expect(combinedRelatedness(0.7, 0)).toBeCloseTo(0.7, 10)
    expect(combinedRelatedness(0, 0.4)).toBeCloseTo(0.4, 10)
    const dual = combinedRelatedness(0.5, 0.5)
    expect(dual).toBeCloseTo(0.75, 10)
    expect(dual).toBeGreaterThan(0.5)
    expect(combinedRelatedness(1, 0.3)).toBe(1)
  })
})

describe("rankRelatedSignals", () => {
  it("merges both candidate sets, ranks by fused relatedness, and nulls non-contributing signals", () => {
    const ranked = rankRelatedSignals({
      neighbors: [
        { signalId: signalA, similarity: 0.7 }, // dual signal: semScore 0.5
        { signalId: signalB, similarity: 0.79 }, // semantic only: semScore 0.8
      ],
      coOccurrence: {
        mySessions: 20,
        totalSessions: 1000,
        candidates: [
          { signalId: signalA, sharedSessions: 10, theirSessions: 20 }, // coocScore ≈ 0.70
          { signalId: signalC, sharedSessions: 12, theirSessions: 15 }, // cooc only ≈ 0.83
          { signalId: signalB, sharedSessions: 2, theirSessions: 5 }, // under the floor → cooc null
        ],
      },
    })

    // A: 1 − (1−0.5)(1−0.70) ≈ 0.85 > C ≈ 0.83 > B = 0.8.
    expect(ranked.map((row) => row.signalId)).toEqual([signalA, signalC, signalB])

    const [a, c, b] = ranked
    expect(a?.semantic?.similarity).toBe(0.7)
    expect(a?.semantic?.score).toBeCloseTo(0.5, 10)
    expect(a?.coOccurrence?.sharedSessions).toBe(10)
    expect(a?.coOccurrence?.sharedSessionsPercent).toBeCloseTo(0.5, 10)
    expect(a?.relatedness).toBeGreaterThan(c?.relatedness ?? Number.NaN)

    expect(c?.semantic).toBeNull()
    expect(c?.coOccurrence?.sharedSessionsPercent).toBeCloseTo(0.6, 10)

    expect(b?.semantic?.score).toBeCloseTo(0.8, 10)
    expect(b?.coOccurrence).toBeNull()
  })

  it("drops candidates below the minimum relatedness", () => {
    const ranked = rankRelatedSignals({
      neighbors: [
        // Barely above the semantic floor: semScore ≈ 0.033 < min relatedness.
        { signalId: signalA, similarity: SIGNAL_RELATED_SEMANTIC_FLOOR + 0.01 },
        // Under-floor co-occurrence contributes nothing either.
      ],
      coOccurrence: {
        mySessions: 20,
        totalSessions: 1000,
        candidates: [{ signalId: signalD, sharedSessions: 2, theirSessions: 10 }],
      },
    })

    expect(ranked).toEqual([])
  })

  it("respects the row limit", () => {
    const ranked = rankRelatedSignals({
      neighbors: [
        { signalId: signalA, similarity: 0.8 },
        { signalId: signalB, similarity: 0.75 },
        { signalId: signalC, similarity: 0.7 },
      ],
      coOccurrence: emptyCoOccurrence,
      limit: 2,
    })

    expect(ranked.map((row) => row.signalId)).toEqual([signalA, signalB])
  })
})
