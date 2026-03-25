import type { CheckedState } from "@repo/ui"
import { useCallback, useMemo, useRef, useState } from "react"

type SelectionMode = "none" | "partial" | "all" | "allExcept"

export type BulkSelection<T extends string | number> =
  | { readonly mode: "selected"; readonly rowIds: T[] }
  | { readonly mode: "all" }
  | { readonly mode: "allExcept"; readonly rowIds: T[] }

export interface SelectionState<T extends string | number> {
  mode: SelectionMode
  selectedIds: Set<T>
  excludedIds: Set<T>
}

export const EMPTY_SELECTION: SelectionState<string> = {
  mode: "none",
  selectedIds: new Set(),
  excludedIds: new Set(),
}

export function useSelectableRows<T extends string | number>({
  rowIds,
  initialSelection = [],
  totalRowCount,
  controlledState,
  onStateChange,
}: {
  rowIds: T[]
  initialSelection?: T[]
  totalRowCount: number
  controlledState?: SelectionState<T>
  onStateChange?: (state: SelectionState<T>) => void
}) {
  const [internalState, setInternalState] = useState<SelectionState<T>>(() => ({
    mode: initialSelection.length > 0 ? "partial" : "none",
    selectedIds: new Set(initialSelection),
    excludedIds: new Set(),
  }))

  const selectionState = controlledState ?? internalState
  const setSelectionState = useCallback(
    (updater: SelectionState<T> | ((prev: SelectionState<T>) => SelectionState<T>)) => {
      if (onStateChange) {
        if (typeof updater === "function") {
          onStateChange(updater(selectionState))
        } else {
          onStateChange(updater)
        }
      } else {
        setInternalState(updater as SelectionState<T> | ((prev: SelectionState<T>) => SelectionState<T>))
      }
    },
    [onStateChange, selectionState],
  )

  const lastClickedIdRef = useRef<T | null>(null)

  const headerState = useMemo<CheckedState>(() => {
    switch (selectionState.mode) {
      case "all":
        return true
      case "none":
        return false
      case "partial":
      case "allExcept":
        return "indeterminate"
    }
  }, [selectionState.mode])

  const toggleRow = useCallback(
    <I extends T = T>(id: I | undefined, checked: CheckedState, options?: { shiftKey?: boolean }) => {
      if (id === undefined) return

      const shiftKey = options?.shiftKey ?? false

      if (shiftKey && lastClickedIdRef.current !== null) {
        const anchorIndex = rowIds.indexOf(lastClickedIdRef.current as T)
        const targetIndex = rowIds.indexOf(id as T)

        if (anchorIndex !== -1 && targetIndex !== -1) {
          const from = Math.min(anchorIndex, targetIndex)
          const to = Math.max(anchorIndex, targetIndex)
          const rangeIds = rowIds.slice(from, to + 1)

          setSelectionState((prev) => {
            const newState: SelectionState<T> = {
              mode: prev.mode,
              selectedIds: new Set<T>(prev.selectedIds),
              excludedIds: new Set<T>(prev.excludedIds),
            }

            for (const rangeId of rangeIds) {
              switch (prev.mode) {
                case "all":
                  if (!checked) {
                    if (newState.mode === "all") newState.mode = "allExcept"
                    newState.excludedIds.add(rangeId)
                  }
                  break
                case "none":
                  if (checked) {
                    newState.mode = "partial"
                    newState.selectedIds.add(rangeId)
                  }
                  break
                case "partial":
                  if (checked) {
                    newState.selectedIds.add(rangeId)
                  } else {
                    newState.selectedIds.delete(rangeId)
                  }
                  break
                case "allExcept":
                  if (checked) {
                    newState.excludedIds.delete(rangeId)
                  } else {
                    newState.excludedIds.add(rangeId)
                  }
                  break
              }
            }

            if (newState.mode === "partial" && newState.selectedIds.size === 0) {
              newState.mode = "none"
            }
            if (newState.mode === "allExcept" && newState.excludedIds.size === 0) {
              newState.mode = "all"
            }

            return newState
          })

          lastClickedIdRef.current = id
          return
        }
      }

      lastClickedIdRef.current = id

      setSelectionState((prev) => {
        const newState: SelectionState<T> = {
          mode: prev.mode,
          selectedIds: new Set<T>(prev.selectedIds),
          excludedIds: new Set<T>(prev.excludedIds),
        }

        switch (prev.mode) {
          case "all":
            if (!checked) {
              newState.mode = "allExcept"
              newState.excludedIds = new Set([id])
            }
            break
          case "none":
            if (checked) {
              newState.mode = "partial"
              newState.selectedIds = new Set([id])
            }
            break
          case "partial":
            if (checked) {
              newState.selectedIds.add(id)
            } else {
              newState.selectedIds.delete(id)
              if (newState.selectedIds.size === 0) {
                newState.mode = "none"
              }
            }
            break
          case "allExcept":
            if (checked) {
              newState.excludedIds.delete(id)
              if (newState.excludedIds.size === 0) {
                newState.mode = "all"
              }
            } else {
              newState.excludedIds.add(id)
            }
            break
        }

        return newState
      })
    },
    [rowIds, setSelectionState],
  )

  const selectMany = useCallback(
    (ids: T[]) => {
      if (ids.length === 0) return
      setSelectionState((prev) => {
        const newState: SelectionState<T> = {
          mode: prev.mode,
          selectedIds: new Set<T>(prev.selectedIds),
          excludedIds: new Set<T>(prev.excludedIds),
        }
        for (const id of ids) {
          if (prev.mode === "all" || prev.mode === "allExcept") {
            newState.excludedIds.delete(id)
          } else {
            newState.selectedIds.add(id)
            if (newState.mode === "none") newState.mode = "partial"
          }
        }
        if (newState.mode === "allExcept" && newState.excludedIds.size === 0) {
          newState.mode = "all"
        }
        return newState
      })
    },
    [setSelectionState],
  )

  const deselectMany = useCallback(
    (ids: T[]) => {
      if (ids.length === 0) return
      setSelectionState((prev) => {
        const newState: SelectionState<T> = {
          mode: prev.mode,
          selectedIds: new Set<T>(prev.selectedIds),
          excludedIds: new Set<T>(prev.excludedIds),
        }
        for (const id of ids) {
          if (prev.mode === "all" || prev.mode === "allExcept") {
            newState.excludedIds.add(id)
            if (newState.mode === "all") newState.mode = "allExcept"
          } else if (prev.mode === "partial") {
            newState.selectedIds.delete(id)
          }
        }
        if (newState.mode === "partial" && newState.selectedIds.size === 0) {
          newState.mode = "none"
        }
        return newState
      })
    },
    [setSelectionState],
  )

  const clearSelections = useCallback(() => {
    setSelectionState({
      mode: "none",
      selectedIds: new Set(),
      excludedIds: new Set(),
    })
  }, [setSelectionState])

  const toggleAll = useCallback(() => {
    setSelectionState((prev) => {
      if (prev.mode === "all") {
        return { mode: "none", selectedIds: new Set(), excludedIds: new Set() }
      }
      return { mode: "all", selectedIds: new Set(), excludedIds: new Set() }
    })
  }, [setSelectionState])

  const selectedRowIds = useMemo(() => {
    switch (selectionState.mode) {
      case "all":
        return rowIds.filter((id) => !selectionState.excludedIds.has(id))
      case "none":
        return []
      case "partial":
        return Array.from(selectionState.selectedIds)
      case "allExcept":
        return rowIds.filter((id) => !selectionState.excludedIds.has(id))
    }
  }, [selectionState, rowIds])

  const selectedCount = useMemo(() => {
    switch (selectionState.mode) {
      case "all":
        return totalRowCount - selectionState.excludedIds.size
      case "none":
        return 0
      case "partial":
        return selectionState.selectedIds.size
      case "allExcept":
        return totalRowCount - selectionState.excludedIds.size
    }
  }, [selectionState.mode, selectionState.excludedIds, selectionState.selectedIds, totalRowCount])

  const bulkSelection = useMemo((): BulkSelection<T> | null => {
    switch (selectionState.mode) {
      case "all":
        return { mode: "all" }
      case "allExcept":
        return { mode: "allExcept", rowIds: Array.from(selectionState.excludedIds) }
      case "partial":
        return selectionState.selectedIds.size > 0
          ? { mode: "selected", rowIds: Array.from(selectionState.selectedIds) }
          : null
      case "none":
        return null
    }
  }, [selectionState.mode, selectionState.excludedIds, selectionState.selectedIds])

  return useMemo(() => {
    const isSelected = <I extends T = T>(id: I | undefined) => {
      if (id === undefined) return false

      switch (selectionState.mode) {
        case "all":
          return !selectionState.excludedIds.has(id)
        case "none":
          return false
        case "partial":
          return selectionState.selectedIds.has(id)
        case "allExcept":
          return !selectionState.excludedIds.has(id)
      }
    }

    return {
      selectedCount,
      selectionMode: selectionState.mode,
      excludedIds: selectionState.excludedIds,
      selectedRowIds,
      bulkSelection,
      toggleRow,
      toggleAll,
      selectMany,
      deselectMany,
      clearSelections,
      isSelected,
      headerState,
    }
  }, [
    selectedCount,
    selectionState.mode,
    selectionState.excludedIds,
    selectionState.selectedIds,
    selectedRowIds,
    bulkSelection,
    toggleRow,
    toggleAll,
    selectMany,
    deselectMany,
    clearSelections,
    headerState,
  ])
}
