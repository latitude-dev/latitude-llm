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

  it("matches a section label, case-insensitively and trimmed", () => {
    const groups = groupFilterSections(SECTIONS, "  TOKENS ")
    expect(groups.map((g) => g.id)).toEqual(["performance"])
    expect(groups[0]?.sections.map((s) => s.label)).toEqual(["Tokens Input"])
  })

  it("matches a group label to keep the whole group", () => {
    const groups = groupFilterSections(SECTIONS, "performance")
    expect(groups[0]?.sections.map((s) => s.label)).toEqual(["Cost ($)", "Tokens Input"])
  })

  it("returns nothing when the query matches no label", () => {
    expect(groupFilterSections(SECTIONS, "nonsense")).toEqual([])
  })
})
