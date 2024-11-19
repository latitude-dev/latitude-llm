import { useCallback, useMemo, useState } from 'react'

import { CheckedState } from '@latitude-data/web-ui'

export function useSelectableRows<T extends string | number>({
  rowIds,
  initialSelection = [],
}: {
  rowIds: T[]
  initialSelection?: T[]
}) {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<T>>(
    new Set(initialSelection),
  )

  const headerState = useMemo<CheckedState>(() => {
    const visibleSelectedCount = rowIds.filter((id) =>
      selectedRowIds.has(id),
    ).length

    if (selectedRowIds.size === 0) return false
    if (visibleSelectedCount === rowIds.length && rowIds.length > 0) {
      return true
    }
    return 'indeterminate'
  }, [selectedRowIds, rowIds])

  const isSelected = <I extends T = T>(id: I | undefined) => {
    return id === undefined ? false : selectedRowIds.has(id)
  }

  const toggleRow = useCallback(
    <I extends T = T>(id: I | undefined, checked: CheckedState) => {
      if (id === undefined) return

      setSelectedRowIds((prev) => {
        const newSelected = new Set(prev)
        if (checked) {
          newSelected.add(id)
        } else {
          newSelected.delete(id)
        }
        return newSelected
      })
    },
    [],
  )

  const clearSelections = useCallback(() => {
    setSelectedRowIds(new Set())
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const newSelected = new Set(prev)
      const allVisibleSelected = rowIds.every((id) => newSelected.has(id))
      if (allVisibleSelected) return new Set()

      rowIds.forEach((id) => newSelected.add(id))
      return newSelected
    })
  }, [rowIds, setSelectedRowIds])

  const getSelectedRowIds = useCallback(
    () => Array.from(selectedRowIds),
    [selectedRowIds],
  )

  return {
    selectedCount: selectedRowIds.size,
    getSelectedRowIds,
    toggleRow,
    toggleAll,
    clearSelections,
    isSelected,
    headerState,
  }
}

export type SelectableRowsHook = ReturnType<typeof useSelectableRows>
