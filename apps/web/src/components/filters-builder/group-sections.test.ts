import type { TraceFilterGroupId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { groupFilterSections } from "./group-sections.ts"

const section = (group: TraceFilterGroupId, label: string) => ({ group, label })

const SECTIONS = [
  section("status", "Status"),
  section("identity", "Name"),
  section("identity", "Trace ID"),
  section("performance", "Cost ($)"),
  section("performance", "Tokens Input"),
  section("status", "Error Count"),
  section("custom", "Metadata"),
]

const visible = (groups: ReturnType<typeof groupFilterSections<(typeof SECTIONS)[number]>>) =>
  groups
    .filter((g) => !g.hidden)
    .map((g) => ({ id: g.id, labels: g.sections.filter((s) => !s.hidden).map((s) => s.label) }))

describe("groupFilterSections", () => {
  it("orders groups by the registry and keeps source order within a group", () => {
    const groups = groupFilterSections(SECTIONS, "")
    expect(groups.map((g) => g.id)).toEqual(["identity", "status", "performance", "custom"])
    expect(groups[1]?.sections.map((s) => s.label)).toEqual(["Status", "Error Count"])
  })

  it("drops groups with no section", () => {
    const groups = groupFilterSections([section("scores", "Has scores")], "")
    expect(groups.map((g) => g.id)).toEqual(["scores"])
  })

  it("shows nothing as hidden when the query is empty", () => {
    const groups = groupFilterSections(SECTIONS, "")
    expect(groups.some((g) => g.hidden)).toBe(false)
    expect(groups.flatMap((g) => g.sections).some((s) => s.hidden)).toBe(false)
  })

  it("matches a section label, case-insensitively and trimmed", () => {
    expect(visible(groupFilterSections(SECTIONS, "  TOKENS "))).toEqual([
      { id: "performance", labels: ["Tokens Input"] },
    ])
  })

  it("matches a group label to keep the whole group", () => {
    expect(visible(groupFilterSections(SECTIONS, "performance"))).toEqual([
      { id: "performance", labels: ["Cost ($)", "Tokens Input"] },
    ])
  })

  it("keeps non-matching sections mounted but hidden", () => {
    const groups = groupFilterSections(SECTIONS, "trace")
    // Every group and section still comes back so debounced edits survive the search.
    expect(groups.map((g) => g.id)).toEqual(["identity", "status", "performance", "custom"])
    expect(groups.flatMap((g) => g.sections)).toHaveLength(SECTIONS.length)
    expect(visible(groups)).toEqual([{ id: "identity", labels: ["Trace ID"] }])
  })

  it("marks every group hidden when the query matches no label", () => {
    const groups = groupFilterSections(SECTIONS, "nonsense")
    expect(groups.every((g) => g.hidden)).toBe(true)
    expect(visible(groups)).toEqual([])
  })
})
