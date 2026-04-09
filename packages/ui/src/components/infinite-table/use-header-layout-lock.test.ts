import { describe, expect, it } from "vitest"
import type { InfiniteTableColumn } from "./types.ts"
import { resolveLockedHeaderLayout } from "./use-header-layout-lock.ts"

type Row = { id: string }

function buildColumn(
  key: string,
  overrides: Partial<InfiniteTableColumn<Row>> = {},
): InfiniteTableColumn<Row> {
  return {
    key,
    header: key,
    render: () => null,
    ...overrides,
  }
}

describe("resolveLockedHeaderLayout", () => {
  it("keeps explicit widths as the starting floor for data columns", () => {
    const layout = resolveLockedHeaderLayout({
      headerCells: [{ offsetWidth: 32 }, { offsetWidth: 120 }, { offsetWidth: 80 }],
      columns: [buildColumn("name", { width: 150 }), buildColumn("status", { width: 60 })],
      leadingColumnCount: 1,
      measuredTableWidth: 232,
    })

    expect(layout.lockedHeaderWidths).toEqual([32, 150, 80])
    expect(layout.lockedTableWidth).toBe(262)
  })

  it("preserves larger measured widths when a column naturally grows", () => {
    const layout = resolveLockedHeaderLayout({
      headerCells: [{ offsetWidth: 220 }, { offsetWidth: 140 }],
      columns: [buildColumn("name", { width: 160 }), buildColumn("status", { width: 120 })],
      leadingColumnCount: 0,
      measuredTableWidth: 360,
    })

    expect(layout.lockedHeaderWidths).toEqual([220, 140])
    expect(layout.lockedTableWidth).toBe(360)
  })
})
