import { describe, expect, it } from "vitest"
import { type AbandonmentOccurrence, abandonmentFloor } from "./abandonment-floor.ts"

const occurrence = (overrides: Partial<AbandonmentOccurrence> = {}): AbandonmentOccurrence => ({
  sessionId: "session-1",
  flaggerSlug: "tool-call-errors",
  messageIndex: 4,
  ...overrides,
})

describe("abandonmentFloor", () => {
  it("floors a failure-mode detector whose user gave up after it fired", () => {
    expect(
      abandonmentFloor({
        occurrences: [occurrence()],
        abandonmentIndexBySession: new Map([["session-1", 7]]),
      }),
    ).toBe("medium")
  })

  it("counts abandonment on the matched message itself", () => {
    expect(
      abandonmentFloor({
        occurrences: [occurrence({ messageIndex: 4 })],
        abandonmentIndexBySession: new Map([["session-1", 4]]),
      }),
    ).toBe("medium")
  })

  // Mere co-occurrence would credit a user who gave up over something unrelated
  // before the tool ever failed.
  it("ignores abandonment that happened before the detector matched", () => {
    expect(
      abandonmentFloor({
        occurrences: [occurrence({ messageIndex: 9 })],
        abandonmentIndexBySession: new Map([["session-1", 2]]),
      }),
    ).toBeNull()
  })

  it("ignores abandonment in a different session", () => {
    expect(
      abandonmentFloor({
        occurrences: [occurrence()],
        abandonmentIndexBySession: new Map([["session-2", 9]]),
      }),
    ).toBeNull()
  })

  // A cost observation, not something a user is failed by. Its correlation with
  // abandonment is length: long expensive sessions have poor cache hit rates and
  // also get abandoned more.
  it("does not floor low-cache-hit-rate", () => {
    expect(
      abandonmentFloor({
        occurrences: [occurrence({ flaggerSlug: "low-cache-hit-rate" })],
        abandonmentIndexBySession: new Map([["session-1", 9]]),
      }),
    ).toBeNull()
  })

  // Model-rated signals already have a severity input; this exists for the
  // population that has none.
  it("does not floor a model-rated detector or a human annotation", () => {
    for (const flaggerSlug of ["frustration", undefined]) {
      expect(
        abandonmentFloor({
          occurrences: [occurrence({ flaggerSlug })],
          abandonmentIndexBySession: new Map([["session-1", 9]]),
        }),
      ).toBeNull()
    }
  })

  // No index, no ordering to check. The evidence behind this floor is thin enough
  // that falling back to session-level co-occurrence is not worth it.
  it("does not floor when the detector recorded no message index", () => {
    expect(
      abandonmentFloor({
        occurrences: [occurrence({ messageIndex: undefined })],
        abandonmentIndexBySession: new Map([["session-1", 9]]),
      }),
    ).toBeNull()
  })

  it("floors on any qualifying occurrence, not only the first", () => {
    expect(
      abandonmentFloor({
        occurrences: [
          occurrence({ sessionId: "quiet", messageIndex: 1 }),
          occurrence({ sessionId: "walked-away", messageIndex: 3 }),
        ],
        abandonmentIndexBySession: new Map([["walked-away", 5]]),
      }),
    ).toBe("medium")
  })

  it("returns null with nothing to go on", () => {
    expect(abandonmentFloor({ occurrences: [], abandonmentIndexBySession: new Map() })).toBeNull()
  })
})
