import type { AlertIncidentCondition } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { monitorAttributionBlocks } from "./blocks.ts"

const textOf = (block: unknown): string => {
  const elements = (block as { elements?: { text?: string }[] }).elements ?? []
  return elements[0]?.text ?? ""
}

describe("monitorAttributionBlocks", () => {
  it("returns no blocks for a legacy incident (no monitorName)", () => {
    expect(
      monitorAttributionBlocks({
        webAppUrl: "https://app.latitude.so",
        projectSlug: "acme",
        monitorName: undefined,
        monitorSlug: undefined,
        incidentKind: "issue.new",
        condition: null,
      }),
    ).toEqual([])
  })

  it("renders a deep-linked 'Created by monitor X' context line", () => {
    const blocks = monitorAttributionBlocks({
      webAppUrl: "https://app.latitude.so/",
      projectSlug: "acme",
      monitorName: "Issue discovered",
      monitorSlug: "issue-discovered",
      incidentKind: "issue.new",
      condition: null,
    })
    expect(blocks).toHaveLength(1)
    expect(textOf(blocks[0])).toBe(
      "Created by monitor <https://app.latitude.so/projects/acme/monitors?monitorSlug=issue-discovered|Issue discovered>",
    )
  })

  it("falls back to bold text when the project/monitor slug can't build a link", () => {
    const blocks = monitorAttributionBlocks({
      webAppUrl: "https://app.latitude.so",
      projectSlug: undefined,
      monitorName: "Issue discovered",
      monitorSlug: "issue-discovered",
      incidentKind: "issue.new",
      condition: null,
    })
    expect(textOf(blocks[0])).toBe("Created by monitor *Issue discovered*")
  })

  it("appends a humanised condition line when a condition is present", () => {
    const condition: AlertIncidentCondition = {
      kind: "savedSearch.threshold",
      threshold: { mode: "absolute", count: 100 },
    }
    const blocks = monitorAttributionBlocks({
      webAppUrl: "https://app.latitude.so",
      projectSlug: "acme",
      monitorName: "5xx spike",
      monitorSlug: "5xx-spike",
      incidentKind: "savedSearch.threshold",
      condition,
    })
    expect(blocks).toHaveLength(2)
    expect(textOf(blocks[1])).toContain("100 times")
  })
})
