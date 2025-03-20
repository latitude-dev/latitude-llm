'use client'

import { DataGrid as ReactDataGrid, type DataGridProps } from 'react-data-grid'
import { cn } from '../../../lib/utils'

export type {
  RenderCellProps,
  CellClickArgs,
  CellMouseEvent,
  DataGridProps,
} from 'react-data-grid'

const DEFAULT_ROW_HEIGHT = 35

// TODO: style this better
const NoRowsFallback = ({ fallbackText }: { fallbackText: string }) => (
  <div>{fallbackText}</div>
)

export type Props<R> = DataGridProps<R> & {
  fallbackText?: string
}

// NOTE: .latitude-data-grid is used to override css variables.
export default function DataGrid<R>({
  className,
  headerRowHeight = DEFAULT_ROW_HEIGHT,
  rowHeight = DEFAULT_ROW_HEIGHT,
  fallbackText = 'No rows.',
  renderers,
  ...rest
}: Props<R>) {
  return (
    <ReactDataGrid<R>
      className={cn(
        'latitude-data-grid ',
        'custom-scrollbar h-full max-h-full flex-grow',
        'border rounded-lg',
        className,
      )}
      headerRowHeight={headerRowHeight}
      rowHeight={rowHeight}
      renderers={{
        ...renderers,
        noRowsFallback: <NoRowsFallback fallbackText={fallbackText} />,
      }}
      {...rest}
    />
  )
}
