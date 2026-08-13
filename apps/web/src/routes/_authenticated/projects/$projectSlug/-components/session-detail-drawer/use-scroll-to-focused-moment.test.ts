import { describe, expect, it } from "vitest"
import type { SessionMomentIntelligenceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { resolveFocusedMomentTarget } from "./use-scroll-to-focused-moment.ts"

function moment({
  momentId,
  firstMessageIndex,
  label,
}: {
  readonly momentId: string
  readonly firstMessageIndex: number
  readonly label?: { readonly labelId: string; readonly kind: string; readonly lastMessageIndex: number }
}): SessionMomentIntelligenceRecord {
  return {
    moment: {
      momentId,
      analysisHash: "hash",
      firstMessageIndex,
      lastMessageIndex: firstMessageIndex + 1,
      boundaryReason: "test",
      coherenceScore: 1,
    },
    labels: label
      ? [
          {
            ...label,
            actor: "assistant",
            firstMessageIndex,
            summary: "summary",
            evidence: "evidence",
            confidence: 1,
          },
        ]
      : [],
    taxonomyObservations: [],
  }
}

const moments = [
  moment({ momentId: "moment-a", firstMessageIndex: 2 }),
  moment({
    momentId: "moment-b",
    firstMessageIndex: 10,
    label: { labelId: "label-b", kind: "handoff", lastMessageIndex: 12 },
  }),
]

describe("resolveFocusedMomentTarget", () => {
  it("prefers a focused label kind over a moment id", () => {
    const target = resolveFocusedMomentTarget({
      focusMomentKind: "handoff",
      focusMomentId: "moment-a",
      moments,
      loadedMessageCount: 25,
    })

    expect(target?.anchorIndex).toBe(12)
    expect(target?.targetLabel?.labelId).toBe("label-b")
    expect(target?.momentTarget).toBeUndefined()
  })

  it("falls back to the focused semantic moment", () => {
    const target = resolveFocusedMomentTarget({
      focusMomentKind: undefined,
      focusMomentId: "moment-a",
      moments,
      loadedMessageCount: 25,
    })

    expect(target?.anchorIndex).toBe(2)
    expect(target?.momentTarget?.moment.momentId).toBe("moment-a")
  })

  it("waits until the target message is loaded", () => {
    expect(
      resolveFocusedMomentTarget({
        focusMomentKind: "handoff",
        focusMomentId: undefined,
        moments,
        loadedMessageCount: 12,
      }),
    ).toBeNull()
  })
})
