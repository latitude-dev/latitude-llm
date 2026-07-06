import { describe, expect, it } from "vitest"
import { selectStage } from "./use-staged-status.ts"

const STAGES = [
  { atSeconds: 0, label: "Reading" },
  { atSeconds: 3, label: "Writing" },
  { atSeconds: 14, label: "Refining" },
]

describe("selectStage", () => {
  it("returns the first stage at zero elapsed", () => {
    expect(selectStage(STAGES, 0)).toBe("Reading")
  })

  it("advances exactly at each stage boundary", () => {
    expect(selectStage(STAGES, 2.9)).toBe("Reading")
    expect(selectStage(STAGES, 3)).toBe("Writing")
    expect(selectStage(STAGES, 13.9)).toBe("Writing")
    expect(selectStage(STAGES, 14)).toBe("Refining")
  })

  it("holds the last stage indefinitely", () => {
    expect(selectStage(STAGES, 10_000)).toBe("Refining")
  })

  it("clamps to the first stage before its start", () => {
    expect(selectStage([{ atSeconds: 5, label: "Later" }], 0)).toBe("Later")
  })

  it("returns null for empty stages", () => {
    expect(selectStage([], 12)).toBeNull()
  })

  it("does not depend on stage order", () => {
    const unsorted = [
      { atSeconds: 14, label: "Refining" },
      { atSeconds: 0, label: "Reading" },
      { atSeconds: 3, label: "Writing" },
    ]
    expect(selectStage(unsorted, 5)).toBe("Writing")
    expect(selectStage(unsorted, 1)).toBe("Reading")
    expect(selectStage(unsorted, 20)).toBe("Refining")
    expect(
      selectStage(
        [
          { atSeconds: 5, label: "Later" },
          { atSeconds: 9, label: "Latest" },
        ],
        0,
      ),
    ).toBe("Later")
  })
})
