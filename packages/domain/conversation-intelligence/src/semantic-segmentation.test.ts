import { describe, expect, it } from "vitest"
import {
  CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD,
  CONVERSATION_MOMENT_CONTINUITY_MAX_THRESHOLD,
  CONVERSATION_MOMENT_CONTINUITY_MIN_THRESHOLD,
} from "./constants.ts"
import { SemanticMomentBoundaryReason } from "./entities/session-semantic-moment.ts"
import {
  computeSessionContinuityThreshold,
  type SemanticSegmentationTurn,
  segmentSemanticMoments,
} from "./semantic-segmentation.ts"

const turn = (index: number, embedding: readonly number[]): SemanticSegmentationTurn => ({
  index,
  role: index % 2 === 0 ? "user" : "assistant",
  content: `message ${index}`,
  embedding,
})

describe("computeSessionContinuityThreshold", () => {
  it("uses the global default when there are too few adjacent pairs", () => {
    expect(computeSessionContinuityThreshold([turn(0, [1, 0]), turn(1, [1, 0])])).toBe(
      CONVERSATION_MOMENT_CONTINUITY_DEFAULT_THRESHOLD,
    )
  })

  it("uses median minus MAD and clamps to the configured range", () => {
    const turns = [
      turn(0, [1, 0]),
      turn(1, [1, 0]),
      turn(2, [1, 0]),
      turn(3, [1, 0]),
      turn(4, [1, 0]),
      turn(5, [1, 0]),
      turn(6, [1, 0]),
    ]

    expect(computeSessionContinuityThreshold(turns)).toBe(CONVERSATION_MOMENT_CONTINUITY_MAX_THRESHOLD)

    const driftingTurns = [
      turn(0, [1, 0]),
      turn(1, [0.7, 0.3]),
      turn(2, [0.7, 0.3]),
      turn(3, [0.7, 0.3]),
      turn(4, [0.7, 0.3]),
      turn(5, [0.7, 0.3]),
      turn(6, [0.7, 0.3]),
    ]
    expect(computeSessionContinuityThreshold(driftingTurns)).toBeGreaterThanOrEqual(
      CONVERSATION_MOMENT_CONTINUITY_MIN_THRESHOLD,
    )
  })
})

describe("segmentSemanticMoments", () => {
  it("splits contiguous turns when similarity drops below the threshold", () => {
    const segments = segmentSemanticMoments({
      threshold: 0.8,
      turns: [turn(0, [1, 0]), turn(1, [0.98, 0.02]), turn(2, [0, 1]), turn(3, [0.01, 0.99])],
    })

    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({
      firstTurnIndex: 0,
      lastTurnIndex: 1,
      turnIndexes: [0, 1],
      boundaryReason: SemanticMomentBoundaryReason.SessionStart,
    })
    expect(segments[1]).toMatchObject({
      firstTurnIndex: 2,
      lastTurnIndex: 3,
      turnIndexes: [2, 3],
      boundaryReason: SemanticMomentBoundaryReason.SemanticDrift,
    })
  })

  it("splits at the configured max moment length", () => {
    const segments = segmentSemanticMoments({
      threshold: 0.8,
      maxTurnsPerMoment: 2,
      turns: [turn(0, [1, 0]), turn(1, [1, 0]), turn(2, [1, 0])],
    })

    expect(segments).toHaveLength(2)
    expect(segments[1]?.boundaryReason).toBe(SemanticMomentBoundaryReason.MaxLength)
  })

  it("keeps same-topic exchanges together across role boundaries", () => {
    const segments = segmentSemanticMoments({
      threshold: 0.8,
      turns: [
        turn(0, [1, 0]),
        { ...turn(1, [1, 0]), role: "assistant", content: "Detailed answer. ".repeat(20) },
        { ...turn(2, [1, 0]), role: "user", content: "Thanks, and what about the second step you mentioned?" },
      ],
    })

    expect(segments).toHaveLength(1)
    expect(segments[0]?.turnIndexes).toEqual([0, 1, 2])
  })
})
