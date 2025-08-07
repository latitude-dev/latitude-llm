import { useCallback, useMemo, useState } from 'react'

import { CheckedState } from '@latitude-data/web-ui/atoms/Checkbox'

export type SelectionMode = 'NONE' | 'PARTIAL' | 'ALL' | 'ALL_EXCEPT'

interface SelectionState<T extends string | number> {
  mode: SelectionMode
  selectedIds: Set<T>
  excludedIds: Set<T>
}

export function useSelectableRows<T extends string | number>({
  rowIds,
  initialSelection = [],
  totalRowCount,
}: {
  rowIds: T[]
  initialSelection?: T[]
  totalRowCount: number
}) {
  const [selectionState, setSelectionState] = useState<SelectionState<T>>(
    () => ({
      mode: initialSelection.length > 0 ? 'PARTIAL' : 'NONE',
      selectedIds: new Set(initialSelection),
      excludedIds: new Set(),
    }),
  )

  const headerState = useMemo<CheckedState>(() => {
    switch (selectionState.mode) {
      case 'ALL':
        return true
      case 'NONE':
        return false
      case 'PARTIAL':
      case 'ALL_EXCEPT':
        return 'indeterminate'
    }
  }, [selectionState.mode])

  const toggleRow = useCallback(
    <I extends T = T>(id: I | undefined, checked: CheckedState) => {
      if (id === undefined) return

      setSelectionState((prev) => {
        const newState: SelectionState<T> = {
          mode: prev.mode,
          selectedIds: new Set<T>(prev.selectedIds),
          excludedIds: new Set<T>(prev.excludedIds),
        }

        switch (prev.mode) {
          case 'ALL':
            if (!checked) {
              newState.mode = 'ALL_EXCEPT'
              newState.excludedIds = new Set([id])
            }
            break
          case 'NONE':
            if (checked) {
              newState.mode = 'PARTIAL'
              newState.selectedIds = new Set([id])
            }
            break
          case 'PARTIAL':
            if (checked) {
              newState.selectedIds.add(id)
            } else {
              newState.selectedIds.delete(id)
              if (newState.selectedIds.size === 0) {
                newState.mode = 'NONE'
              }
            }
            break
          case 'ALL_EXCEPT':
            if (checked) {
              newState.excludedIds.delete(id)
              if (newState.excludedIds.size === 0) {
                newState.mode = 'ALL'
              }
            } else {
              newState.excludedIds.add(id)
            }
            break
        }

        return newState
      })
    },
    [],
  )

  const clearSelections = useCallback(() => {
    setSelectionState({
      mode: 'NONE',
      selectedIds: new Set(),
      excludedIds: new Set(),
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectionState((prev) => {
      if (prev.mode === 'ALL') {
        return {
          mode: 'NONE',
          selectedIds: new Set(),
          excludedIds: new Set(),
        }
      }
      return {
        mode: 'ALL',
        selectedIds: new Set(),
        excludedIds: new Set(),
      }
    })
  }, [])

  const selectedRowIds = useMemo(() => {
    switch (selectionState.mode) {
      case 'ALL':
        return rowIds.filter((id) => !selectionState.excludedIds.has(id))
      case 'NONE':
        return []
      case 'PARTIAL':
        return Array.from(selectionState.selectedIds)
      case 'ALL_EXCEPT':
        return rowIds.filter((id) => !selectionState.excludedIds.has(id))
    }
    // This is legitimate case since rowIds is an array we need to force a deep
    // equality check to compute the memo only when the array's content has
    // changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionState, rowIds.join('')])

  const selectedCount = useMemo(() => {
    switch (selectionState.mode) {
      case 'ALL':
        return totalRowCount - selectionState.excludedIds.size
      case 'NONE':
        return 0
      case 'PARTIAL':
        return selectionState.selectedIds.size
      case 'ALL_EXCEPT':
        return totalRowCount - selectionState.excludedIds.size
    }
  }, [
    selectionState.mode,
    selectionState.excludedIds,
    selectionState.selectedIds,
    totalRowCount,
  ])

  return useMemo(() => {
    const isSelected = <I extends T = T>(id: I | undefined) => {
      if (id === undefined) return false

      switch (selectionState.mode) {
        case 'ALL':
          return !selectionState.excludedIds.has(id)
        case 'NONE':
          return false
        case 'PARTIAL':
          return selectionState.selectedIds.has(id)
        case 'ALL_EXCEPT':
          return !selectionState.excludedIds.has(id)
      }
    }

    return {
      selectedCount,
      selectionMode: selectionState.mode,
      excludedIds: selectionState.excludedIds,
      selectedRowIds,
      toggleRow,
      toggleAll,
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
    toggleRow,
    toggleAll,
    clearSelections,
    headerState,
  ])
}

export type SelectableRowsHook = ReturnType<typeof useSelectableRows>
