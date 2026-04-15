import type { AnnotationScore } from "@domain/scores"
import { describe, expect, it } from "vitest"
import { anchorFromExistingAnnotationScore } from "./anchor-from-existing-annotation-score.ts"

/** Minimal stub — the helper only reads `metadata`. */
function annotationScoreWithMetadata(metadata: Record<string, unknown> & { rawFeedback: string }): AnnotationScore {
  return { source: "annotation", metadata } as AnnotationScore
}

describe("anchorFromExistingAnnotationScore", () => {
  it("returns undefined when messageIndex is absent", () => {
    expect(
      anchorFromExistingAnnotationScore(annotationScoreWithMetadata({ rawFeedback: "only feedback" })),
    ).toBeUndefined()
  })

  it("returns messageIndex-only anchor", () => {
    expect(
      anchorFromExistingAnnotationScore(annotationScoreWithMetadata({ rawFeedback: "x", messageIndex: 4 })),
    ).toEqual({ messageIndex: 4 })
  })

  it("returns messageIndex and partIndex when offsets are absent", () => {
    expect(
      anchorFromExistingAnnotationScore(
        annotationScoreWithMetadata({ rawFeedback: "x", messageIndex: 1, partIndex: 0 }),
      ),
    ).toEqual({ messageIndex: 1, partIndex: 0 })
  })

  it("returns full text-range anchor when all index fields are present", () => {
    expect(
      anchorFromExistingAnnotationScore(
        annotationScoreWithMetadata({
          rawFeedback: "x",
          messageIndex: 2,
          partIndex: 0,
          startOffset: 10,
          endOffset: 25,
        }),
      ),
    ).toEqual({
      messageIndex: 2,
      partIndex: 0,
      startOffset: 10,
      endOffset: 25,
    })
  })

  it("returns undefined when startOffset and endOffset violate schema (start > end)", () => {
    expect(
      anchorFromExistingAnnotationScore(
        annotationScoreWithMetadata({
          rawFeedback: "x",
          messageIndex: 0,
          partIndex: 0,
          startOffset: 20,
          endOffset: 5,
        }),
      ),
    ).toBeUndefined()
  })

  it("ignores a lone startOffset when endOffset is missing (keeps message + part)", () => {
    expect(
      anchorFromExistingAnnotationScore(
        annotationScoreWithMetadata({
          rawFeedback: "x",
          messageIndex: 0,
          partIndex: 0,
          startOffset: 3,
        }),
      ),
    ).toEqual({ messageIndex: 0, partIndex: 0 })
  })
})
