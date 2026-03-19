// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useSelectableRows } from "./useSelectableRows.ts"

const IDS = ["a", "b", "c", "d", "e"]

function setup(overrides?: { rowIds?: string[]; totalRowCount?: number; initialSelection?: string[] }) {
  const rowIds = overrides?.rowIds ?? IDS
  return renderHook(() =>
    useSelectableRows({
      rowIds,
      totalRowCount: overrides?.totalRowCount ?? rowIds.length,
      ...(overrides?.initialSelection ? { initialSelection: overrides.initialSelection } : {}),
    }),
  )
}

describe("useSelectableRows", () => {
  describe("initial state", () => {
    it("starts with nothing selected", () => {
      const { result } = setup()
      expect(result.current.selectionMode).toBe("none")
      expect(result.current.selectedCount).toBe(0)
      expect(result.current.headerState).toBe(false)
      expect(result.current.bulkSelection).toBeNull()
    })

    it("starts in partial mode when initialSelection is provided", () => {
      const { result } = setup({ initialSelection: ["b", "d"] })
      expect(result.current.selectionMode).toBe("partial")
      expect(result.current.selectedCount).toBe(2)
      expect(result.current.isSelected("b")).toBe(true)
      expect(result.current.isSelected("d")).toBe(true)
      expect(result.current.isSelected("a")).toBe(false)
    })
  })

  describe("toggleRow (single click)", () => {
    it("selects a row from none", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("b", true))

      expect(result.current.selectionMode).toBe("partial")
      expect(result.current.selectedCount).toBe(1)
      expect(result.current.isSelected("b")).toBe(true)
      expect(result.current.isSelected("a")).toBe(false)
    })

    it("deselects the last row and returns to none", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("b", true))
      act(() => result.current.toggleRow("b", false))

      expect(result.current.selectionMode).toBe("none")
      expect(result.current.selectedCount).toBe(0)
    })

    it("accumulates multiple selections in partial mode", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("a", true))
      act(() => result.current.toggleRow("c", true))
      act(() => result.current.toggleRow("e", true))

      expect(result.current.selectionMode).toBe("partial")
      expect(result.current.selectedCount).toBe(3)
      expect(result.current.isSelected("a")).toBe(true)
      expect(result.current.isSelected("b")).toBe(false)
      expect(result.current.isSelected("c")).toBe(true)
    })

    it("unchecking a row in all mode transitions to allExcept", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      expect(result.current.selectionMode).toBe("all")

      act(() => result.current.toggleRow("c", false))
      expect(result.current.selectionMode).toBe("allExcept")
      expect(result.current.isSelected("c")).toBe(false)
      expect(result.current.isSelected("a")).toBe(true)
      expect(result.current.selectedCount).toBe(4)
    })

    it("re-checking all excluded rows returns to all", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("c", false))
      expect(result.current.selectionMode).toBe("allExcept")

      act(() => result.current.toggleRow("c", true))
      expect(result.current.selectionMode).toBe("all")
      expect(result.current.selectedCount).toBe(5)
    })

    it("ignores undefined id", () => {
      const { result } = setup()
      act(() => result.current.toggleRow(undefined, true))
      expect(result.current.selectionMode).toBe("none")
    })
  })

  describe("toggleAll", () => {
    it("selects all from none", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())

      expect(result.current.selectionMode).toBe("all")
      expect(result.current.selectedCount).toBe(5)
      expect(result.current.headerState).toBe(true)
    })

    it("deselects all from all", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleAll())

      expect(result.current.selectionMode).toBe("none")
      expect(result.current.selectedCount).toBe(0)
    })

    it("selects all from partial mode", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("b", true))
      act(() => result.current.toggleAll())

      expect(result.current.selectionMode).toBe("all")
      expect(result.current.selectedCount).toBe(5)
    })

    it("selects all from allExcept mode", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("a", false))
      expect(result.current.selectionMode).toBe("allExcept")

      act(() => result.current.toggleAll())
      expect(result.current.selectionMode).toBe("all")
    })
  })

  describe("clearSelections", () => {
    it("resets everything to none", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("c", false))
      act(() => result.current.clearSelections())

      expect(result.current.selectionMode).toBe("none")
      expect(result.current.selectedCount).toBe(0)
      expect(result.current.bulkSelection).toBeNull()
    })
  })

  describe("selectedCount with totalRowCount", () => {
    it("uses totalRowCount for all mode, not local rowIds length", () => {
      const { result } = setup({ totalRowCount: 3000 })
      act(() => result.current.toggleAll())

      expect(result.current.selectedCount).toBe(3000)
    })

    it("subtracts excluded from totalRowCount in allExcept", () => {
      const { result } = setup({ totalRowCount: 3000 })
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("a", false))
      act(() => result.current.toggleRow("b", false))

      expect(result.current.selectedCount).toBe(2998)
    })
  })

  describe("selectedRowIds", () => {
    it("returns selected ids in partial mode", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("b", true))
      act(() => result.current.toggleRow("d", true))

      expect(result.current.selectedRowIds).toEqual(expect.arrayContaining(["b", "d"]))
      expect(result.current.selectedRowIds).toHaveLength(2)
    })

    it("returns all local rowIds in all mode", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())

      expect(result.current.selectedRowIds).toEqual(IDS)
    })

    it("excludes ids in allExcept mode", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("c", false))

      expect(result.current.selectedRowIds).toEqual(["a", "b", "d", "e"])
    })

    it("returns empty array in none mode", () => {
      const { result } = setup()
      expect(result.current.selectedRowIds).toEqual([])
    })
  })

  describe("bulkSelection", () => {
    it("returns null in none mode", () => {
      const { result } = setup()
      expect(result.current.bulkSelection).toBeNull()
    })

    it("returns selected mode with rowIds for partial", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("a", true))
      act(() => result.current.toggleRow("c", true))

      expect(result.current.bulkSelection).toEqual({
        mode: "selected",
        rowIds: expect.arrayContaining(["a", "c"]),
      })
    })

    it("returns all mode when all selected", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())

      expect(result.current.bulkSelection).toEqual({ mode: "all" })
    })

    it("returns allExcept mode with excluded rowIds", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("b", false))

      expect(result.current.bulkSelection).toEqual({
        mode: "allExcept",
        rowIds: ["b"],
      })
    })
  })

  describe("isSelected", () => {
    it("returns false for undefined", () => {
      const { result } = setup()
      expect(result.current.isSelected(undefined)).toBe(false)
    })

    it("returns true for all rows in ALL mode", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())

      for (const id of IDS) {
        expect(result.current.isSelected(id)).toBe(true)
      }
    })

    it("returns false for excluded rows in allExcept mode", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("c", false))

      expect(result.current.isSelected("a")).toBe(true)
      expect(result.current.isSelected("c")).toBe(false)
    })
  })

  describe("headerState", () => {
    it("is false when none", () => {
      const { result } = setup()
      expect(result.current.headerState).toBe(false)
    })

    it("is true when all", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      expect(result.current.headerState).toBe(true)
    })

    it("is indeterminate when partial", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("a", true))
      expect(result.current.headerState).toBe("indeterminate")
    })

    it("is indeterminate when allExcept", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("a", false))
      expect(result.current.headerState).toBe("indeterminate")
    })
  })

  describe("shift+click range selection", () => {
    it("selects a range from none mode", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("b", true))
      act(() => result.current.toggleRow("d", true, { shiftKey: true }))

      expect(result.current.selectionMode).toBe("partial")
      expect(result.current.isSelected("a")).toBe(false)
      expect(result.current.isSelected("b")).toBe(true)
      expect(result.current.isSelected("c")).toBe(true)
      expect(result.current.isSelected("d")).toBe(true)
      expect(result.current.isSelected("e")).toBe(false)
      expect(result.current.selectedCount).toBe(3)
    })

    it("selects a range in reverse direction", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("d", true))
      act(() => result.current.toggleRow("b", true, { shiftKey: true }))

      expect(result.current.isSelected("a")).toBe(false)
      expect(result.current.isSelected("b")).toBe(true)
      expect(result.current.isSelected("c")).toBe(true)
      expect(result.current.isSelected("d")).toBe(true)
      expect(result.current.isSelected("e")).toBe(false)
    })

    it("extends an existing partial selection with shift+click", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("a", true))
      act(() => result.current.toggleRow("c", true))
      act(() => result.current.toggleRow("e", true, { shiftKey: true }))

      expect(result.current.isSelected("a")).toBe(true)
      expect(result.current.isSelected("c")).toBe(true)
      expect(result.current.isSelected("d")).toBe(true)
      expect(result.current.isSelected("e")).toBe(true)
      expect(result.current.isSelected("b")).toBe(false)
    })

    it("deselects a range with shift+click when unchecking", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("b", false))
      expect(result.current.selectionMode).toBe("allExcept")

      act(() => result.current.toggleRow("d", false, { shiftKey: true }))

      expect(result.current.isSelected("a")).toBe(true)
      expect(result.current.isSelected("b")).toBe(false)
      expect(result.current.isSelected("c")).toBe(false)
      expect(result.current.isSelected("d")).toBe(false)
      expect(result.current.isSelected("e")).toBe(true)
    })

    it("without prior anchor, shift+click behaves as normal click", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("c", true, { shiftKey: true }))

      expect(result.current.selectionMode).toBe("partial")
      expect(result.current.selectedCount).toBe(1)
      expect(result.current.isSelected("c")).toBe(true)
    })

    it("updates the anchor after a shift+click for chained ranges", () => {
      const { result } = setup()
      act(() => result.current.toggleRow("a", true))
      act(() => result.current.toggleRow("c", true, { shiftKey: true }))

      expect(result.current.selectedCount).toBe(3)

      act(() => result.current.toggleRow("e", true, { shiftKey: true }))

      expect(result.current.isSelected("a")).toBe(true)
      expect(result.current.isSelected("b")).toBe(true)
      expect(result.current.isSelected("c")).toBe(true)
      expect(result.current.isSelected("d")).toBe(true)
      expect(result.current.isSelected("e")).toBe(true)
    })

    it("re-checks excluded rows in allExcept mode via shift+click", () => {
      const { result } = setup()
      act(() => result.current.toggleAll())
      act(() => result.current.toggleRow("b", false))
      act(() => result.current.toggleRow("c", false))
      act(() => result.current.toggleRow("d", false))
      expect(result.current.selectedCount).toBe(2)

      act(() => result.current.toggleRow("b", true))
      act(() => result.current.toggleRow("d", true, { shiftKey: true }))

      expect(result.current.selectionMode).toBe("all")
      expect(result.current.selectedCount).toBe(5)
    })
  })
})
