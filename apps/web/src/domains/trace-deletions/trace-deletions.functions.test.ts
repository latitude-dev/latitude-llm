import { describe, expect, it } from "vitest"
import {
  createTraceDeletionInputSchema,
  TRACE_DELETION_CONFIRMATION,
  toTraceDeletionSelector,
  traceDeletionSelectorSchema,
} from "./trace-deletions.functions.ts"

const TRACE_A = "a".repeat(32)
const TRACE_B = "b".repeat(32)
const byTag = { tags: [{ op: "contains" as const, value: "customer:acme" }] }

describe("toTraceDeletionSelector", () => {
  it("deletes exactly the picked traces", () => {
    expect(toTraceDeletionSelector({ mode: "selected", rowIds: [TRACE_A] }, byTag)).toEqual({ traceIds: [TRACE_A] })
  })

  it("deletes what the list's filters match when everything is selected", () => {
    expect(toTraceDeletionSelector({ mode: "all" }, byTag)).toEqual({ filters: byTag })
    expect(toTraceDeletionSelector({ mode: "allExcept", rowIds: [] }, byTag)).toEqual({ filters: byTag })
  })

  it("keeps the rows unselected from a select-all", () => {
    expect(toTraceDeletionSelector({ mode: "allExcept", rowIds: [TRACE_A, TRACE_B] }, byTag)).toEqual({
      filters: { ...byTag, traceId: [{ op: "notIn", value: [TRACE_A, TRACE_B] }] },
    })
  })
})

describe("trace deletion input", () => {
  it("refuses a select-all over a search, which filters can't reproduce", () => {
    const input = { projectId: "p", selection: { mode: "all" as const }, filters: byTag }
    expect(traceDeletionSelectorSchema.safeParse({ ...input, hasSearchQuery: true }).success).toBe(false)
    expect(traceDeletionSelectorSchema.safeParse(input).success).toBe(true)
    expect(
      traceDeletionSelectorSchema.safeParse({
        projectId: "p",
        selection: { mode: "selected", rowIds: [TRACE_A] },
        hasSearchQuery: true,
      }).success,
    ).toBe(true)
  })

  it("caps picked and unselected rows at what a trace id filter can hold", () => {
    const ids = (count: number) => Array.from({ length: count }, (_, i) => String(i).padStart(32, "0"))
    const parse = (selection: object) => traceDeletionSelectorSchema.safeParse({ projectId: "p", selection })
    expect(parse({ mode: "selected", rowIds: ids(100) }).success).toBe(true)
    expect(parse({ mode: "selected", rowIds: ids(101) }).success).toBe(false)
    expect(parse({ mode: "allExcept", rowIds: ids(100) }).success).toBe(true)
    expect(parse({ mode: "allExcept", rowIds: ids(101) }).success).toBe(false)
  })

  it("requires the exact confirmation phrase", () => {
    const input = { projectId: "p", selection: { mode: "selected" as const, rowIds: [TRACE_A] } }
    expect(
      createTraceDeletionInputSchema.safeParse({ ...input, confirmation: TRACE_DELETION_CONFIRMATION }).success,
    ).toBe(true)
    expect(createTraceDeletionInputSchema.safeParse({ ...input, confirmation: "yes" }).success).toBe(false)
  })
})
