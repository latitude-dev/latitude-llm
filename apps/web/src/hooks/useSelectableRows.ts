import { useCallback, useMemo, useState } from 'react'

import { CheckedState } from '@latitude-data/web-ui/atoms/Checkbox'

export function useSelectableRows<T extends string | number>({
  rowIds,
  initialSelection = [],
  totalRowCount,
}: {
  rowIds: T[]
  initialSelection?: T[]
  totalRowCount: number
}) {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<T> | undefined>(
    new Set(initialSelection),
  )

  const headerState = useMemo<CheckedState>(() => {
    if (!selectedRowIds) return true

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
    return id === undefined
      ? false
      : !selectedRowIds
        ? true
        : selectedRowIds.has(id)
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
    setSelectedRowIds((prev) => (!prev ? new Set() : undefined))
  }, [rowIds, setSelectedRowIds])

  const getSelectedRowIds = useCallback(
    () => (selectedRowIds ? Array.from(selectedRowIds) : []),
    [selectedRowIds],
  )

  return {
    selectedCount: selectedRowIds ? selectedRowIds.size : totalRowCount,
    getSelectedRowIds,
    toggleRow,
    toggleAll,
    clearSelections,
    isSelected,
    headerState,
  }
}

export type SelectableRowsHook = ReturnType<typeof useSelectableRows>
