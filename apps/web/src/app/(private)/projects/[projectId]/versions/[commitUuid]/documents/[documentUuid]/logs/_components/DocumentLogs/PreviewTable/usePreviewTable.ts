import { useCallback } from 'react'
import { Column } from '@latitude-data/core/schema'

type Props = {
  previewStaticColumns?: Map<string, boolean>
  previewParameterColumns?: Map<string, boolean>
  onSelectStaticColumn?: (column: string) => void
  onSelectParameterColumn?: (column: string) => void
}

export function usePreviewTable({
  previewStaticColumns,
  previewParameterColumns,
  onSelectStaticColumn,
  onSelectParameterColumn,
}: Props) {
  const isColumnSelected = (column: Column) => {
    if (column.role === 'parameter') {
      return previewParameterColumns?.get(column.name) ?? false
    } else if (column.role === 'label' || column.role === 'metadata') {
      return previewStaticColumns?.get(column.name) ?? false
    }
  }

  const handleSelectColumn = useCallback(
    (column: Column) => {
      if (column.role === 'parameter') {
        onSelectParameterColumn?.(column.name)
      } else if (column.role === 'label' || column.role === 'metadata') {
        onSelectStaticColumn?.(column.name)
      }
    },
    [onSelectParameterColumn, onSelectStaticColumn],
  )

  return {
    isColumnSelected,
    handleSelectColumn,
  }
}
